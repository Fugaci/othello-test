(() => {
    "use strict";

    // 定数
    const EMPTY = 0,
        BLACK = 1,
        WHITE = 2;
        
    // t秒後に解決されるPromiseを作成
    const wait = t => new Promise(resolve => setTimeout(resolve, t));

    // オセロのコア部分
    const Othello = (() => {
        // 外に出さないインスタンスのデータ
        const puttableCellsMap = new WeakMap(),
            finishResolveMap = new WeakMap();

        // 右を0とし、反時計回りに順に振られる番号を上下左右の数値に変換
        const convertDirection = direction => {
            let dr = 0, dc = 0;
            if(7 <= direction || direction <= 1) dc = 1;
            if(1 <= direction && direction <= 3) dr = -1;
            if(3 <= direction && direction <= 5) dc = -1;
            if(5 <= direction && direction <= 7) dr = 1;
            return {row: dr, column: dc};
        };

        class Othello {
            // 初期化処理
            constructor(size, players) {
                // サイズが偶数かどうか
                if(size >= 4 && size % 2 !== 0)
                    throw new Error("サイズは4以上の偶数にしてください");

                // インスタンスのプロパティを代入
                this.size = size;
                this.players = players;

                // すべて空の盤面(二次元配列)を生成
                const board = this.board = [];
                for(let i = 0; i < size; i++) {
                    const row = new Array(size);
                    row.fill(EMPTY);
                    board.push(row);
                }

                // 中央の市松模様
                board[size / 2 - 1][size / 2 - 1] = WHITE;
                board[size / 2 - 1][size / 2] = BLACK;
                board[size / 2][size / 2 - 1] = BLACK;
                board[size / 2][size / 2] = WHITE;

                // 先攻は黒
                this.turn = BLACK;

                // 前回パスしたか
                this.lastPassed = false;

                // 終了Promise これのthenで終了を検知する
                this.finishPromise = new Promise(resolve => 
                    finishResolveMap.set(this, resolve));
            }

            // ゲームを進める
            async next() {
                const {turn, board} = this,
                    ans = await this.players[
                        turn === BLACK ? "black" : "white"].think(this);

                // 前回パスし、今回もパスなら終了
                if(this.lastPassed && ans === false) {
                    // 黒と白の数をカウント
                    const flatted = board.flat(),
                        black = flatted.filter(c => c === BLACK).length,
                        white = flatted.filter(c => c === WHITE).length;

                    // 終了Promiseを解決
                    finishResolveMap.get(this)({turn, black, white});

                    // 終了時にはnextメソッドはfalseを返す
                    return false;
                }

                // 今回パスしたかどうか
                this.lastPassed = !Boolean(ans);

                // 配置
                this.put(ans);

                // 終了してないのでtrue
                return true;
            }

            // ボードの中に入っているか
            _isInBoard(row, col) {
                const {size} = this;
                return 0 <= row && row < size &&
                    0 <= col && col < size;
            }

            // 盤面を複製
            clone(players) {
                const {board, size} = this,
                    clone = new Othello(size, players),
                    {board: cloneBoard} = clone;

                for(let r = 0; r < size; r++)
                    for(let c = 0; c < size; c++)
                        cloneBoard[r][c] = board[r][c];

                clone.turn = this.turn;
                clone.lastPassed = this.lastPassed;

                return clone;
            }

            // ある方向に順に見ていく
            lookInOrder({row, column, direction, target, callback}) {
                const {board} = this,
                    {row: dr, column: dc} = convertDirection(direction);

                // 現在の位置
                let currentRow = row + dr,
                    currentColumn = column + dc;

                // 盤面の外かターゲットでない場合には抜ける
                if(
                    !this._isInBoard(currentRow, currentColumn) ||
                    board[currentRow][currentColumn] !== target
                ) return;

                // 順に進める
                let count = 0;
                while(true) {
                    count ++;
                    
                    currentRow += dr;
                    currentColumn += dc;

                    // 盤面の外に出たら抜ける
                    if(!this._isInBoard(currentRow, currentColumn)) break;

                    // コールバックを呼んで継続するか
                    const callbackAns = callback(currentRow, currentColumn, count);
                    if(!callbackAns) break;
                }
            }

            // 打てるマスを探す
            findPuttableCells() {
                // すでに計算されていればそれを返す
                const puttableCells = puttableCellsMap.get(this);
                if(puttableCells) return puttableCells;
                
                const {board, turn} = this,
                    opposite = turn === BLACK ? WHITE : BLACK,
                    result = [];

                // すべてのマスを見る
                board.forEach((r, row) => r.forEach((cell, column) => {
                    // 現在のターンの石の場合のみ実行
                    if(cell !== turn) return;

                    // 8方向すべてを順にみる
                    for(let direction = 0; direction < 8; direction++) {
                        this.lookInOrder({
                            row, column, direction,
                            target: opposite,
                            callback(currentRow, currentColumn) {
                                const cell = board[currentRow][currentColumn];

                                // 相手の石なら継続
                                if(cell === opposite) return true;

                                // 自分の石なら中断
                                else if(cell === turn) return false;

                                // 空ならここをresultに追加して中断
                                else {
                                    result.push([currentRow, currentColumn]);
                                    return false;
                                }
                            }
                        });
                    }
                }));

                // resultから重複を削除
                const uniqueResult = result.filter((v1, i1, arr) => {
                    return arr.findIndex(v2 => v1[0] === v2[0] && v1[1] === v2[1]) === i1;
                });

                // 計算済みなので保存
                puttableCellsMap.set(this, uniqueResult);

                // 返す
                return uniqueResult;
            }

            // 打つ
            put(pos) {
                // 打てる場所を探す
                const puttableCells = this.findPuttableCells();

                // パス処理
                if(pos === false) {
                    if(puttableCells.length === 0) {
                        this.changeTurn();
                        return;
                    }
                    else throw new Error("パスできません");
                }

                const [row, column] = pos;
                
                // 打てるかどうかチェック
                if(!puttableCells.some(
                    val => val[0] === row && val[1] === column))
                    throw new Error("そこには打てません");

                const {turn, board} = this,
                    opposite = turn === BLACK ? WHITE : BLACK;
                this.board[row][column] = turn;

                // ひっくりかえせるところを探す
                const result = [];
                
                // すべての方向に順に見る
                for(let direction = 0; direction < 8; direction++) {
                    this.lookInOrder({
                        row, column, direction,
                        target: opposite,
                        callback(currentRow, currentColumn, count) {
                            const cell = board[currentRow][currentColumn];

                            // 自分の石ならresultに追加して抜ける
                            // 相手なら続ける
                            // 空なら抜ける
                            if(cell === turn) {
                                result.push({direction, count});
                                return false;
                            }else if(cell === opposite) return true;
                            else return false;
                        }
                    });
                }

                // ひっくりかえす
                result.forEach(({direction, count}) => {
                    const {row: dr, column: dc} = convertDirection(direction);
                    for(let i = 1; i <= count; i++) {
                        const currentRow = row + dr * i,
                            currentColumn = column + dc * i;
                        board[currentRow][currentColumn] = turn;
                    }
                });

                this.changeTurn();
            }

            // 手番を反転
            changeTurn() {
                this.turn = this.turn === BLACK ? WHITE : BLACK;
                puttableCellsMap.delete(this);
            }
        }

        return Othello;
    })();

    // 打てる場所の中からランダムに打つプレイヤー
    class RandomAutoPlayer {
        constructor(waitTime) {
            this.waitTime = waitTime;
        }
        async think(game) {
            const puttableCells = game.findPuttableCells(),
                {waitTime} = this;

            if(waitTime !== 0)
                await wait(this.waitTime);

            if(puttableCells.length !== 0)
                return puttableCells[Math.floor(Math.random() * puttableCells.length)];

            else return false;
        }
    }

    class MonteCarloAutoPlayer {
        constructor(repeat, waitTime, waitBeforeThink) {
            // 試行回数
            this.repeat = repeat;
            // 計算が早く終わっても待つ時間
            this.waitTime = waitTime;
            // 計算前に待つかどうか(UIがブロックされるのを防ぐ)
            this.waitBeforeThink = waitBeforeThink;
        }
        async think(game) {
            console.time("MonteCarloAutoPlayer:think");

            // 計算前に待つ
            if(this.waitBeforeThink) await wait(50);

            const {repeat, waitTime} = this,
                {turn} = game,
                waitPromsie = wait(waitTime),
                puttableCells = game.findPuttableCells();
            
            // パス
            if(puttableCells.length === 0){
                console.time("MonteCarloAutoPlayer:think");
                return false;
            }

            let answer = {
                winCount: 0,
                cell: puttableCells[0]
            };
            for(let i = 0, {length} = puttableCells; i < length; i++) {
                // 打てる手すべて
                const cell = puttableCells[i];
                let winCount = 0;

                for(let j = 0; j < repeat; j++) {
                    // repeat回ランダムで試す
                    const clone = game.clone({
                        black: new RandomAutoPlayer(0),
                        white: new RandomAutoPlayer(0)
                    });
                    clone.put(cell);

                    // 終わるまでランダムに進める
                    while(true) if(!(await clone.next())) break;

                    // 勝ったら加算
                    clone.finishPromise.then(({black, white}) => {
                        if(turn === BLACK ? black >= white : white >= black)
                            winCount++;
                    });
                }

                // すでにある最強の選択肢より強ければ上書き
                if(winCount > answer.winCount)
                    answer = {winCount, cell};
            }

            // 待つ
            if(waitTime !== 0) await waitPromsie;

            console.timeEnd("MonteCarloAutoPlayer:think");

            // 返す
            return answer.cell;
        }
    }

    window.OthelloGame = window.OthelloGame || {
        Othello, RandomAutoPlayer, MonteCarloAutoPlayer,
        constants: {EMPTY, BLACK, WHITE}
    };
})();