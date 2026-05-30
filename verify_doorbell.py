#!/usr/bin/env python3
"""
Reference implementation of the SPEC-doorbell encryption envelope.

This script:
1. Defines the encrypt/decrypt operations exactly as specified in SPEC-doorbell §5.
2. Generates and prints test vectors that can be used to validate the JS implementation.
3. Performs a round-trip test.
"""

import os
import base64
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


HKDF_INFO = b"cradle/doorbell-v1"


def b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode("ascii")


def b64url_decode(s: str) -> bytes:
    pad = (4 - len(s) % 4) % 4
    return base64.urlsafe_b64decode(s + "=" * pad)


def x25519_pub_bytes(priv: X25519PrivateKey) -> bytes:
    return priv.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )


def hkdf32(shared: bytes, salt: bytes, info: bytes) -> bytes:
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=salt, info=info).derive(shared)


def encrypt(recipient_pubkey_bytes: bytes, plaintext: bytes,
            ephemeral_priv: X25519PrivateKey | None = None,
            nonce: bytes | None = None) -> bytes:
    """Encrypt per SPEC-doorbell §5.2."""
    if ephemeral_priv is None:
        ephemeral_priv = X25519PrivateKey.generate()
    if nonce is None:
        nonce = os.urandom(12)

    e_pub = x25519_pub_bytes(ephemeral_priv)
    recipient_pub = X25519PublicKey.from_public_bytes(recipient_pubkey_bytes)
    shared = ephemeral_priv.exchange(recipient_pub)
    salt = e_pub + recipient_pubkey_bytes
    aes_key = hkdf32(shared, salt, HKDF_INFO)

    aesgcm = AESGCM(aes_key)
    # cryptography.AESGCM appends the tag to the ciphertext, matching our wire format.
    ct = aesgcm.encrypt(nonce, plaintext, associated_data=e_pub)

    return e_pub + nonce + ct


def decrypt(recipient_priv: X25519PrivateKey, wire: bytes) -> bytes:
    """Decrypt per SPEC-doorbell §5.3."""
    e_pub = wire[:32]
    nonce = wire[32:44]
    ct = wire[44:]

    recipient_pub_bytes = x25519_pub_bytes(recipient_priv)
    ephemeral_pub = X25519PublicKey.from_public_bytes(e_pub)
    shared = recipient_priv.exchange(ephemeral_pub)
    salt = e_pub + recipient_pub_bytes
    aes_key = hkdf32(shared, salt, HKDF_INFO)

    aesgcm = AESGCM(aes_key)
    return aesgcm.decrypt(nonce, ct, associated_data=e_pub)


# ============================================================
# Test vectors
# ============================================================

print("=" * 60)
print("Test vector 1: deterministic encrypt/decrypt round-trip")
print("=" * 60)

# Fixed recipient key (for testing only; real users generate their own)
recipient_priv_bytes = bytes.fromhex(
    "77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a"
)
recipient_priv = X25519PrivateKey.from_private_bytes(recipient_priv_bytes)
recipient_pub_bytes = x25519_pub_bytes(recipient_priv)
print(f"recipient_priv (hex):  {recipient_priv_bytes.hex()}")
print(f"recipient_priv (b64u): {b64url(recipient_priv_bytes)}")
print(f"recipient_pub  (hex):  {recipient_pub_bytes.hex()}")
print(f"recipient_pub  (b64u): {b64url(recipient_pub_bytes)}")
print()

# Fixed ephemeral key (so vector is deterministic; in production it's random)
ephemeral_priv_bytes = bytes.fromhex(
    "5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb"
)
ephemeral_priv = X25519PrivateKey.from_private_bytes(ephemeral_priv_bytes)
ephemeral_pub_bytes = x25519_pub_bytes(ephemeral_priv)
print(f"ephemeral_priv (hex):  {ephemeral_priv_bytes.hex()}")
print(f"ephemeral_pub  (hex):  {ephemeral_pub_bytes.hex()}")
print()

# Fixed nonce (deterministic; in production random)
nonce = bytes.fromhex("000102030405060708090a0b")
print(f"nonce (hex):           {nonce.hex()}")
print()

# Plaintext
plaintext = b"delivery\n\xf0\x9f\x93\xa6 Delivery"  # "delivery\n📦 Delivery"
print(f"plaintext:             {plaintext!r}  ({len(plaintext)} bytes)")
print()

# Encrypt
wire = encrypt(recipient_pub_bytes, plaintext,
               ephemeral_priv=ephemeral_priv, nonce=nonce)
print(f"wire (hex):            {wire.hex()}")
print(f"wire (b64u):           {b64url(wire)}")
print(f"wire length:           {len(wire)} bytes (= 32 ephemeral + 12 nonce + {len(wire)-44} ciphertext)")
print()

# Verify wire structure
assert wire[:32] == ephemeral_pub_bytes
assert wire[32:44] == nonce
assert len(wire) == 32 + 12 + len(plaintext) + 16
print("Structure check: PASS")

# Decrypt round-trip
recovered = decrypt(recipient_priv, wire)
assert recovered == plaintext
print(f"Decrypt round-trip: PASS ({recovered!r})")

print()
print("=" * 60)
print("Test vector 2: random round-trip")
print("=" * 60)

# Random keys, random message
r_priv = X25519PrivateKey.generate()
r_pub = x25519_pub_bytes(r_priv)
msg = b"text\nThe package is at the neighbor's at #12."
print(f"plaintext: {msg!r} ({len(msg)} bytes)")

wire2 = encrypt(r_pub, msg)
print(f"wire length: {len(wire2)} bytes")

recovered2 = decrypt(r_priv, wire2)
assert recovered2 == msg
print(f"Round-trip: PASS")

print()
print("All doorbell envelope tests PASSED ✓")
