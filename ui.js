window.addEventListener("DOMContentLoaded", () => {
    "use strict";
    
    const {
        Othello, RandomAutoPlayer, MonteCarloAutoPlayer,
        constants: {EMPTY, BLACK, WHITE}
    } = OthelloGame;

    const table = document.getElementById("table");

    // 人間
    const HumanPlayer = (() => {
        class HumanPlayer {
            constructor(el) {
                this.el = el;
            }
            think(game) {
                const {el} = this;
                return new Promise(resolve => {
                    const puttableCells = game.findPuttableCells();
                    
                    if(puttableCells.length === 0) resolve(false);

                    const onClick = e => {
                        const td = e.target.closest("td"),
                            row = td.getAttribute("data-row") - 0,
                            column = td.getAttribute("data-column") - 0;
                        if(puttableCells.some(
                            cell => cell[0] === row && cell[1] === column)){
                            el.removeEventListener("click", onClick);
                            resolve([row, column]);
                        }
                    };

                    el.addEventListener("click", onClick);
                });
            }
        }
        return HumanPlayer;
    })();

    // ゲーム進行
    const startGame = async (game, vm) => {
        while(true) {
            const puttableCells = game.findPuttableCells(),
                {turn} = game;
                
            table.classList.remove(turn === BLACK ? "white" : "black");
            table.classList.add(turn === WHITE ? "white" : "black");
            table.classList[
                game.players[turn === BLACK ? "black" : "white"] instanceof HumanPlayer
                    ? "add" : "remove"]("humanTurn");

            table.innerHTML = game.board.map((row, rowNum) =>
                `<tr>${
                    row.map((cell, colNum) =>
                        `<td data-row="${rowNum}" data-column="${colNum}" class="cell_${cell} ${
                            puttableCells.some(
                                val => val[0] === rowNum && val[1] === colNum)
                            ? "puttable"
                            : ""
                        }"></td>`).join("")
                }</tr>`).join("");
            
            const flatten = game.board.flat();
            vm.turn = game.turn === BLACK ? "黒" : "白";
            vm.blackCount = flatten.filter(cell => cell === BLACK).length;
            vm.whiteCount = flatten.filter(cell => cell === WHITE).length;

            if(!(await game.next())) break;
        }

        game.finishPromise.then(({black, white}) => {
            if(black === white)
                vm.winnerMessage = "引き分け";
            else if(black > white)
                vm.winnerMessage = "黒の勝ち";
            else if(white > black)
                vm.winnerMessage = "白の勝ち";
        });
    };

    // UI用のVueの設定
    new Vue({
        el: "#app",
        data: () => ({
            EMPTY, BLACK, WHITE,
            showSettings: true,
            size: 8,
            blackPlayer: "human",
            whitePlayer: "montecarlo",
            blackTryNum: 100,
            whiteTryNum: 100,
            winnerMessage: "",
            turn: "",
            blackCount: 0,
            whiteCount: 0
        }),
        methods: {
            async init() {
                this.showSettings = false;

                const {blackPlayer, whitePlayer} = this;
                let black, white;

                if(blackPlayer === "human")
                    black = new HumanPlayer(table);
                else if(blackPlayer === "random")
                    black = new RandomAutoPlayer(100);
                else if(blackPlayer === "montecarlo")
                    black = new MonteCarloAutoPlayer(this.blackTryNum, 0, true);

                if(whitePlayer === "human")
                    white = new HumanPlayer(table);
                else if(whitePlayer === "random")
                    white = new RandomAutoPlayer(100);
                else if(whitePlayer === "montecarlo")
                    white = new MonteCarloAutoPlayer(this.whiteTryNum, 0, true);

                startGame(new Othello(this.size, {black, white}), this);
            }
        }
    });
});