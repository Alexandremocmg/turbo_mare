'use strict';

const cupTracks=['baia','estaleiro','farol'];
const cupPrizes=[10,8,6,4,2,1];
const cupTotal=row=>row.scores.reduce((sum,value)=>sum+(value||0),0);

function compareCupScores(a,b){
  return cupTotal(b)-cupTotal(a)||(b.scores.at(-1)||0)-(a.scores.at(-1)||0);
}

function rankCup(board){
  return board.slice().sort((a,b)=>compareCupScores(a,b)||a.slot-b.slot);
}

function scoreCupLeg(board,leg,rows){
  const ranked=rows.filter(row=>row.eligible===true);
  for(const pilot of board){
    const place=ranked.findIndex(row=>row.slot===pilot.slot);
    pilot.scores[leg]=cupPrizes[place]||0;
  }
}
