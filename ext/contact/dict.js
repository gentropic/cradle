// Deflate preset-dictionary for the `contact` format — the single source, inlined
// into the bootloader (DICT_CONTACT) and the editor by build/build.js, and used to
// key q:d.contact_<base45> capsules. Common contact tokens, most-frequent toward the
// end (cheaper back-reference distance). MUST stay byte-identical across consumers —
// edit here, then `npm run build` (the dict-drift test guards it).
module.exports = {
  contact:
    "ig= in= gh= x= yt= minimal dark bold mono www. .com.br https:// · *\n\n# +55 " +
    "\n@avatar: \n@org: \n@role: \n@map: \n@social: \n@site: \n@email: \n@wa: " +
    "\n@accent: #\n@tel: \n@template: \n!contact1+en-US\n!contact1+pt-BR\n",
};
