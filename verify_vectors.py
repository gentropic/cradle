#!/usr/bin/env python3
"""
Verification script for SPEC-capsule.md and SPEC-menu.md test vectors.
Produces verified, copy-pasteable test vectors.
"""

import zlib
import base64

# ---- base45 (RFC 9285) ----
B45_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:"

def base45_encode(data: bytes) -> str:
    out = []
    i = 0
    while i + 2 <= len(data):
        n = (data[i] << 8) | data[i+1]
        a = n % 45
        n //= 45
        b = n % 45
        n //= 45
        c = n
        out.append(B45_ALPHABET[a])
        out.append(B45_ALPHABET[b])
        out.append(B45_ALPHABET[c])
        i += 2
    if i < len(data):
        n = data[i]
        a = n % 45
        b = n // 45
        out.append(B45_ALPHABET[a])
        out.append(B45_ALPHABET[b])
    return "".join(out)

# ---- base64url ----
def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")

# ---- deflate-raw ----
def deflate_raw(data: bytes) -> bytes:
    c = zlib.compressobj(9, zlib.DEFLATED, -15)
    return c.compress(data) + c.flush()

def deflate_raw_dict(data: bytes, dictionary: bytes) -> bytes:
    c = zlib.compressobj(9, zlib.DEFLATED, -15, zlib.DEF_MEM_LEVEL, zlib.Z_DEFAULT_STRATEGY, dictionary)
    return c.compress(data) + c.flush()

# ---- menu-ptbr dictionary (from q-bootloader.html DICT_PT_BR) ----
DICT_MENU_PTBR = (
    "|garrafa\n"
    "|6 unidades\n|8 unidades\n"
    "## Vinhos brancos\n## Vinhos tintos\n## Espumantes\n"
    "## Entradas\n## Principais\n## Massas\n## Sobremesas\n## Sushi\n## Sashimi\n"
    "## Hot rolls\n## Combinados\n## Pratos quentes\n## Bebidas\n## Cafés\n"
    "manjericão, "
    "molho de tomate, parmesão reggiano, azeite extra virgem, "
    "salmão grelhado, filé mignon, picanha, frango à parmegiana, "
    "risoto de cogumelos, sorvete de creme, "
    "frutas vermelhas, leite de coco, "
    "calda de caramelo, calda de chocolate, "
    "molho madeira, molho de pimenta, "
    "carpaccio, bruschetta, tiramisù, cheesecake, petit gateau, pudim, "
    "spaghetti, linguine, ravioli, lasanha, nhoque, fettuccine, "
    "queijo, presunto, alho, cebola, tomate, batata, arroz, "
    "salmão, atum, camarão, filé, frango, carne, peixe, polvo, lula, "
    "yakisoba, niguiri, sashimi, uramaki, hot roll, harumaki, gyoza, tempura, "
    "philadelphia, california, "
    "espresso, cappuccino, café com leite, mocha, chocolate quente, "
    "tapioca, pão de queijo, brigadeiro, beijinho, "
    "porção, unidades, garrafa, taça, copo, "
    "@template: minimal\n@template: bistro\n@template: serif\n@template: dark\n"
    "@accent: \n@valid_until: \n@service: \n@couvert: \n@social: \n"
).encode("utf-8")

# ============================================================
# Test vectors
# ============================================================
print("=" * 60)
print("D.1 — inline:raw / i:r / q:r with 'hello world\\n'")
print("=" * 60)
content = b"hello world\n"
print(f"content bytes: {content!r}  ({len(content)} bytes)")
print(f"base64url:     {b64url(content)}")
print(f"base45:        {base45_encode(content)}")
print(f"long form:     inline:raw:{b64url(content)}")
print(f"compact:       i:r{b64url(content)}")
print(f"qr form:       q:r{base45_encode(content)}")
print()

print("=" * 60)
print("D.2 — inline:deflate / i:d / q:d with 'the quick brown fox'")
print("=" * 60)
content = b"the quick brown fox jumps over the lazy dog."
compressed = deflate_raw(content)
print(f"content:           {content.decode()}  ({len(content)} bytes)")
print(f"deflate-raw bytes: {len(compressed)} bytes")
print(f"base64url:         {b64url(compressed)}")
print(f"base45:            {base45_encode(compressed)}")
print(f"long form:         inline:deflate:{b64url(compressed)}")
print(f"compact:           i:d{b64url(compressed)}")
print(f"qr form:           q:d{base45_encode(compressed)}")
print()

print("=" * 60)
print("Menu example — Café da Esquina (Appendix A of SPEC-menu)")
print("=" * 60)
menu_body = """@template: bistro
@accent: #8b4513
@social: ig=cafedaesquina, ws=5531987654321

# Café da Esquina

## Cafés
Espresso|6
Cappuccino|9||l
Café com leite|7

## Doces
Pão de queijo|4||g
Brigadeiro|3
Cheesecake|14|Calda de frutas vermelhas

## Salgados
Pastel de carne|8|Massa fininha, recheio caprichado|p
Coxinha|7||vg
"""
magic_line = "!menu1+pt-BR\n"
full_payload = (magic_line + menu_body).encode("utf-8")

# Wire format: magic_line, 0x0A, deflate-dict(body)
# But actually per SPEC-menu §1, the whole payload (magic + 0x0A + body) is what
# capsule resolves to. So capsule's job is to deliver magic_line + body as bytes,
# and dict-deflate applies to the whole thing.
# 
# Wait, reading again: SPEC-menu §1 says payload = magic-line 0x0A body, and the
# dictionary applies "to the whole payload". Let me check what makes more sense.
# Actually for q1 the prefix was uncompressed (so decoder could pick dictionary),
# but in our cradle architecture the dict-id is in the capsule itself, so the
# whole payload including magic line can be compressed.

compressed_full = deflate_raw_dict(full_payload, DICT_MENU_PTBR)
b45_full = base45_encode(compressed_full)
capsule = f"q:d.menu-ptbr_{b45_full}"
full_url = f"https://gentropic.org/cradle#{capsule}"

print(f"body bytes:              {len(menu_body.encode('utf-8'))} bytes")
print(f"full payload:            {len(full_payload)} bytes")
print(f"deflate-dict compressed: {len(compressed_full)} bytes")
print(f"base45 encoded:          {len(b45_full)} bytes")
print(f"capsule ({len(capsule)} bytes):    {capsule}")
print(f"full URL ({len(full_url)} bytes):  {full_url}")
print()

# QR capacity check
# v15 alphanumeric ECC M: 758 chars
# v20 alphanumeric ECC M: 1062 chars
# v25 alphanumeric ECC M: 1429 chars
# But full URL goes in byte mode unless we're clever
# In byte mode: v15 ECC M = 523 bytes, v20 ECC M = 732 bytes, v25 ECC M = 982 bytes
print(f"URL length: {len(full_url)} chars")
print(f"  Fits in QR v15 ECC M (758 alphanumeric chars or 523 bytes)?",
      "YES (alphanumeric) and YES (byte)" if len(full_url) <= 523 else "byte: NO")
print()

print("=" * 60)
print("Density comparison (D.2 example)")
print("=" * 60)
content = b"the quick brown fox jumps over the lazy dog."
deflated = deflate_raw(content)
b64_str = b64url(deflated)
b45_str = base45_encode(deflated)
print(f"deflate output: {len(deflated)} bytes")
print(f"base64url:  {len(b64_str)} chars")
print(f"base45:     {len(b45_str)} chars")
print()
print("QR bit-cost per encoded byte:")
print(f"  base64url in QR byte mode:    8 bits/char × {len(b64_str)/len(deflated):.3f} chars/byte = {8 * len(b64_str)/len(deflated):.2f} bits/byte")
print(f"  base45 in QR alphanumeric:    5.5 bits/char × {len(b45_str)/len(deflated):.3f} chars/byte = {5.5 * len(b45_str)/len(deflated):.2f} bits/byte")
b64_bits_per_byte = 8 * len(b64_str)/len(deflated)
b45_bits_per_byte = 5.5 * len(b45_str)/len(deflated)
savings = (b64_bits_per_byte - b45_bits_per_byte) / b64_bits_per_byte * 100
print(f"  base45 savings vs base64url in QR:  {savings:.1f}%")

# Roundtrip verification
print()
print("=" * 60)
print("Roundtrip verification")
print("=" * 60)
# D.1 roundtrip
assert base64.urlsafe_b64decode(b64url(b"hello world\n") + "==") == b"hello world\n"
print("D.1 base64url roundtrip: OK")

# D.2 roundtrip
inflated = zlib.decompress(deflate_raw(b"the quick brown fox jumps over the lazy dog."), -15)
assert inflated == b"the quick brown fox jumps over the lazy dog."
print("D.2 deflate-raw roundtrip: OK")

# Menu roundtrip
d = zlib.decompressobj(-15, zdict=DICT_MENU_PTBR)
inflated_menu = d.decompress(compressed_full) + d.flush()
assert inflated_menu == full_payload, f"menu roundtrip failed: {inflated_menu[:100]!r} vs {full_payload[:100]!r}"
print("Menu deflate-dict roundtrip: OK")
