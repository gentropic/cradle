// Single source of truth — edit here, then `npm run build`.
// The dict-drift test guards that bootloader + editor + factory stay in sync.
module.exports = {
  "arcr": "\n@title \n@about \n@bg plain\n@bg stars\n@bg dots\n@bg grid\n@lives 3\nobj you : emoji  at=bottom move=tap\nobj  : emoji  at=top move=fall tag=\nobj  : text \" at=center\nevery 1 : spawn emoji  at=top move=fall tag=\non hit you #  : score +1 ; say \"\non tap  : say \" ; \nwhen score >= 10 : win \"\nwhen time >= 30 : win \"when count # == 0 : \nlife -1 ; say \"become it emoji \ndestroy 1 #move=still move=seek move=flee move=chase at=scatter speed=\nlose \"end \"refuse \"add  1\n",
};
