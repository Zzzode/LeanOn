/// <reference types="node" />
// All inputs and keys in this file are PUBLIC fixed test material, never production secrets.
import { createCipheriv, createDecipheriv, createHash, pbkdf2Sync } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { TextDecoder } from 'node:util';
import { describe, expect, it } from '@rstest/core';
import fixture from './fixtures/public-backup-v1.json';
import { BACKUP_AAD, BACKUP_ITERATIONS, BackupAuthenticationError, decodeBase64, encodeBase64, encryptBackup, inspectEncryptedBackup, isBackupEnvelope, isBackupPayload } from './backup.js';
import type { BackupCryptoPort, BackupEnvelopeDto, BackupJsonPort, BackupPayloadDto } from './backup.js';

const codec: BackupJsonPort = {
  utf8: value => Buffer.from(value, 'utf8'),
  encode: value => Buffer.from(JSON.stringify(value), 'utf8'),
  decode: bytes => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown,
};
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
function publicInputs(): { payload: BackupPayloadDto; envelope: BackupEnvelopeDto } {
  if (!isBackupPayload(fixture.payload) || !isBackupEnvelope(fixture.envelope)) throw new Error('Invalid public interoperability fixture');
  return { payload: fixture.payload, envelope: fixture.envelope };
}
function nodePort(): BackupCryptoPort {
  return {
    async randomBytes(length) {
      if (length === 16) return Buffer.from(fixture.saltHex, 'hex');
      if (length === 12) return Buffer.from(fixture.nonceHex, 'hex');
      throw new Error('Unexpected deterministic fixture random length');
    },
    async deriveKey(password, salt, iterations) { return pbkdf2Sync(password, salt, iterations, 32, 'sha256'); },
    async seal(key, nonce, plaintext, aad) {
      const cipher = createCipheriv('aes-256-gcm', key, nonce);
      cipher.setAAD(aad);
      return Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
    },
    async open(key, nonce, ciphertext, aad) {
      const decipher = createDecipheriv('aes-256-gcm', key, nonce);
      decipher.setAAD(aad);
      decipher.setAuthTag(ciphertext.subarray(-16));
      // Keep partial update output inside the adapter; only return after final verifies the tag.
      return Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]);
    },
  };
}

describe('PUBLIC backup v1 real cryptographic interoperability', () => {
  it('anchors exact UTF-8, PBKDF2 key, GCM ciphertext and SHA-256 without Unicode normalization', async () => {
    const { payload, envelope } = publicInputs();
    const password = codec.utf8(fixture.password);
    expect(Buffer.from(password).toString('hex')).toBe(fixture.passwordUtf8Hex);
    expect(password.byteLength).toBe(fixture.expected.passwordUtf8Bytes);
    expect(fixture.password.normalize('NFC')).not.toBe(fixture.password);
    const key = await nodePort().deriveKey(password, decodeBase64(envelope.salt), BACKUP_ITERATIONS);
    expect(Buffer.from(key).toString('hex')).toBe(fixture.derivedKeyHex);
    expect(BACKUP_AAD).toBe(fixture.aadUtf8);
    expect(sha256(codec.encode(payload))).toBe(fixture.expected.plaintextSha256);
    const actual = await encryptBackup(payload, fixture.password, nodePort(), codec);
    expect(actual).toEqual(envelope);
    expect(sha256(decodeBase64(actual.ciphertext))).toBe(fixture.expected.ciphertextSha256);
    expect(sha256(codec.utf8(JSON.stringify(actual)))).toBe(fixture.expected.envelopeJsonSha256);
  });

  it('authenticates the portable envelope and preserves exact JPEG bytes, Chinese and future null fields', async () => {
    const { payload, envelope } = publicInputs();
    const before = JSON.stringify(payload);
    const plan = await inspectEncryptedBackup(envelope, fixture.password, nodePort(), codec);
    expect(plan.payload).toEqual(payload);
    expect(JSON.stringify(payload)).toBe(before);
    expect(Array.from(codec.encode(plan.payload))).toEqual(Array.from(decodeBase64(fixture.plaintextUtf8Base64)));
    const photo = decodeBase64(plan.payload.photos[0]!.bytesBase64);
    expect(photo.byteLength).toBe(264);
    expect(sha256(photo)).toBe(fixture.expected.photoSha256);
    expect(Array.from(photo.subarray(0, 2))).toEqual([255, 216]);
    expect(Array.from(photo.subarray(-2))).toEqual([255, 217]);
    expect(plan.payload.personal.dietaryPreferences['future']).toEqual({ caption: '中文 · 未来属性', nullable: null, flags: [true, false, null] });
    expect(plan.preview.photoBytes).toBe(fixture.expected.photoBytes);
  });

  it('rejects wrong or normalized passwords and every tampered parameter before JSON decode', async () => {
    const { envelope } = publicInputs();
    let decoded = 0;
    const guarded: BackupJsonPort = { ...codec, decode(bytes) { decoded += 1; return codec.decode(bytes); } };
    for (const password of ['WRONG PUBLIC password', fixture.password.normalize('NFC')]) {
      await expect(inspectEncryptedBackup(envelope, password, nodePort(), guarded)).rejects.toBeInstanceOf(BackupAuthenticationError);
    }
    for (const field of ['salt', 'nonce', 'ciphertext'] as const) {
      const bytes = decodeBase64(envelope[field]);
      bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1;
      await expect(inspectEncryptedBackup({ ...envelope, [field]: encodeBase64(bytes) }, fixture.password, nodePort(), guarded)).rejects.toBeInstanceOf(BackupAuthenticationError);
    }
    const wrongAad = nodePort();
    const open = wrongAad.open;
    wrongAad.open = (key, nonce, ciphertext) => open(key, nonce, ciphertext, codec.utf8('LeanOn backup v2'));
    await expect(inspectEncryptedBackup(envelope, fixture.password, wrongAad, guarded)).rejects.toBeInstanceOf(BackupAuthenticationError);
    expect(decoded).toBe(0);
  });
});
