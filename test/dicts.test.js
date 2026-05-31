// Dictionary drift: a producer (editor/factory) deflates with its copy of a
// dictionary; the bootloader inflates with ITS copy. If the bytes ever differ,
// every capsule of that format silently decodes to garbage. These tests pin
// every dictionary to a single source of truth across files.
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { extractConst } = require("./harness");

test("menu pt-BR dictionary: editor === bootloader", () => {
  const boot = extractConst("index.html", "DICT_MENU_PTBR");
  const editor = extractConst("menu/index.html", "DICT_PT_BR");
  assert.ok(typeof boot === "string" && boot.length > 0, "bootloader DICT_MENU_PTBR missing");
  assert.ok(typeof editor === "string" && editor.length > 0, "editor DICT_PT_BR missing");
  assert.strictEqual(boot, editor, "menu pt-BR dictionary drifted between editor and bootloader");
});

test("menu en-US dictionary: editor === bootloader", () => {
  const boot = extractConst("index.html", "DICT_MENU_ENUS");
  const editor = extractConst("menu/index.html", "DICT_EN_US");
  assert.strictEqual(boot, editor, "menu en-US dictionary drifted between editor and bootloader");
});

test("arcr dictionary: factory === bootloader", () => {
  const boot = extractConst("index.html", "DICT_ARCR");
  const factory = extractConst("arcr/factory.html", "DICT_ARCR");
  assert.ok(typeof boot === "string" && boot.length > 0, "bootloader DICT_ARCR missing");
  assert.strictEqual(boot, factory, "arcr dictionary drifted between factory and bootloader");
});
