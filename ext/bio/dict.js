// Deflate preset-dictionary for the `bio` format — the single source, inlined into
// the bootloader (DICT_BIO) and the editor by build/build.js, and used to key
// q:d.bio_<base45> capsules. The LEGIT kind of dictionary: generic link-hub
// vocabulary (platform codes, directive keys, URL boilerplate, the magic line) —
// NOT anyone's specific handles/content. Most-frequent toward the end (cheaper
// back-reference distance). MUST stay byte-identical across consumers — edit here,
// then `npm run build` (the dict-drift test guards it).
module.exports = {
  bio:
    "minimal brutal dark bold mono sans serif www. .com.br .org .io .github.io " +
    "tiktok soundcloud bandcamp twitch ko-fi telegram youtube instagram github " +
    "tg: tt: sc: bc: tw: ko: yt: in: gh: x: ig: https:// | " +
    "\n# \n*\n@font: \n@map: \n@social: \n@site: \n@email: \n@wa: \n@avatar: " +
    "\n@accent: #\n@tel: \n@template: \n!bio1+en-US\n!bio1+pt-BR\n",
};
