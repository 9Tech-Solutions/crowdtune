// Package tokencrypto provides AES-256-GCM encryption helpers for
// long-lived secrets stored in Postgres (currently the Spotify OAuth
// refresh token).
//
// Wire format: [12-byte nonce][ciphertext+tag], base64-encoded.
// The nonce is generated fresh with crypto/rand on every Encrypt call,
// so encrypting identical plaintext twice produces distinct ciphertexts.
//
// Keys are 32 bytes (AES-256). Source the key from an env var, never
// hard-code. The package name avoids stdlib's crypto import.
package tokencrypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
)

const KeySize = 32

var (
	ErrKeyWrongSize        = errors.New("tokencrypto: key must be 32 bytes")
	ErrCiphertextTruncated = errors.New("tokencrypto: ciphertext shorter than nonce")
	ErrDecryptFailed       = errors.New("tokencrypto: decryption failed (wrong key or tampered ciphertext)")
)

func Encrypt(key []byte, plaintext string) (string, error) {
	if len(key) != KeySize {
		return "", ErrKeyWrongSize
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("aes.NewCipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("cipher.NewGCM: %w", err)
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("rand read: %w", err)
	}
	sealed := gcm.Seal(nil, nonce, []byte(plaintext), nil)
	blob := make([]byte, 0, len(nonce)+len(sealed))
	blob = append(blob, nonce...)
	blob = append(blob, sealed...)
	return base64.StdEncoding.EncodeToString(blob), nil
}

func Decrypt(key []byte, ciphertextB64 string) (string, error) {
	if len(key) != KeySize {
		return "", ErrKeyWrongSize
	}
	blob, err := base64.StdEncoding.DecodeString(ciphertextB64)
	if err != nil {
		return "", fmt.Errorf("base64 decode: %w", err)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("aes.NewCipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("cipher.NewGCM: %w", err)
	}
	if len(blob) < gcm.NonceSize() {
		return "", ErrCiphertextTruncated
	}
	nonce := blob[:gcm.NonceSize()]
	sealed := blob[gcm.NonceSize():]
	plaintext, err := gcm.Open(nil, nonce, sealed, nil)
	if err != nil {
		return "", ErrDecryptFailed
	}
	return string(plaintext), nil
}

// KeyFromHex parses a 64-character hex string into a 32-byte key.
// Convenience for env-var loading.
func KeyFromHex(hexStr string) ([]byte, error) {
	if len(hexStr) != 2*KeySize {
		return nil, fmt.Errorf("tokencrypto: hex key must be %d chars, got %d", 2*KeySize, len(hexStr))
	}
	key, err := hex.DecodeString(hexStr)
	if err != nil {
		return nil, fmt.Errorf("hex decode: %w", err)
	}
	return key, nil
}
