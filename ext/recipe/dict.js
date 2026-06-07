// Deflate preset-dictionary for the `recipe` format — the single source, inlined into
// the bootloader (DICT_RECIPE) and (once it lands) the editor by build/build.js, and used
// to key q:d.recipe_<base45> capsules. The LEGIT kind of dictionary: generic recipe
// vocabulary (units, common ingredients/verbs in pt-BR + en-US, directive keys, the magic
// line) — NOT anyone's specific recipe. Most-frequent toward the end (cheaper back-reference
// distance). MUST stay byte-identical across consumers — edit here, then `npm run build`
// (the dict-drift test guards it once an editor exists).
module.exports = {
  recipe:
    "card paper dark warm kitchen " +
    "colheres de sopa colher de sopa colheres de chá xícaras xícara gramas pitada lata dente " +
    "tablespoon teaspoon tbsp tsp cups cup grams clove pinch " +
    "Misture Adicione Mexa Acrescente Despeje Asse Cozinhe Aqueça Bata Reserve até " +
    "Mix Add Stir Pour Bake Cook Heat Whisk until minutes min " +
    "farinha açúcar manteiga ovos leite água sal óleo alho cebola fermento chocolate " +
    "flour sugar butter eggs milk water salt oil garlic onion " +
    "@source @social @prep @cook @yield @time @serves @accent #@template " +
    " | \n- \n1. \n## \n# \n[10m]\n@serves \n@time \n!recipe1+en-US\n!recipe1+pt-BR\n",
};
