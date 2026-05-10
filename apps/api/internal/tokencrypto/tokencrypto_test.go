package tokencrypto

import (
	"encoding/base64"
	"testing"
)

func makeKey(b byte) []byte {
	k := make([]byte, KeySize)
	for i := range k {
		k[i] = b
	}
	return k
}

func TestEncryptDecrypt_Roundtrip(t *testing.T) {
	cases := []struct {
		name      string
		plaintext string
	}{
		{"empty", ""},
		{"short", "x"},
		{"typical refresh token shape", "AQABCDEFGHabcd-1234567890_xxxxxxxxxxxxxxxxxx"},
		{"long with non-ascii", "tokén-with-üñïcödé-and-newlines\n\t\rOK"},
		{"large", string(make([]byte, 4096))},
	}
	key := makeKey(0x01)
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			ct, err := Encrypt(key, c.plaintext)
			if err != nil {
				t.Fatalf("Encrypt: %v", err)
			}
			if c.plaintext != "" && ct == c.plaintext {
				t.Fatal("ciphertext equals plaintext")
			}
			got, err := Decrypt(key, ct)
			if err != nil {
				t.Fatalf("Decrypt: %v", err)
			}
			if got != c.plaintext {
				t.Errorf("roundtrip mismatch: got %q want %q", got, c.plaintext)
			}
		})
	}
}

func TestEncrypt_NonceUniqueness(t *testing.T) {
	key := makeKey(0x02)
	plaintext := "same-plaintext-every-time"

	a, err := Encrypt(key, plaintext)
	if err != nil {
		t.Fatalf("Encrypt a: %v", err)
	}
	b, err := Encrypt(key, plaintext)
	if err != nil {
		t.Fatalf("Encrypt b: %v", err)
	}
	if a == b {
		t.Fatal("identical plaintext encrypted twice produced identical ciphertext - nonce reuse")
	}
}

func TestDecrypt_WrongKey(t *testing.T) {
	k1 := makeKey(0x01)
	k2 := makeKey(0x02)

	ct, err := Encrypt(k1, "spotify-refresh-secret")
	if err != nil {
		t.Fatalf("Encrypt: %v", err)
	}
	if _, err := Decrypt(k2, ct); err == nil {
		t.Fatal("decrypt with wrong key should fail")
	}
}

func TestDecrypt_Tampered(t *testing.T) {
	key := makeKey(0x03)
	ct, err := Encrypt(key, "secret-payload")
	if err != nil {
		t.Fatalf("Encrypt: %v", err)
	}

	blob, err := base64.StdEncoding.DecodeString(ct)
	if err != nil {
		t.Fatalf("base64 decode: %v", err)
	}
	if len(blob) == 0 {
		t.Fatal("empty blob")
	}
	blob[len(blob)-1] ^= 0x01

	tampered := base64.StdEncoding.EncodeToString(blob)
	if _, err := Decrypt(key, tampered); err == nil {
		t.Fatal("decrypt of tampered ciphertext should fail")
	}
}

func TestEncrypt_KeyWrongSize(t *testing.T) {
	cases := []struct {
		name string
		size int
	}{
		{"empty", 0},
		{"AES-128-sized", 16},
		{"33-byte", 33},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			key := make([]byte, c.size)
			if _, err := Encrypt(key, "x"); err == nil {
				t.Fatal("expected ErrKeyWrongSize")
			}
		})
	}
}

func TestDecrypt_KeyWrongSize(t *testing.T) {
	if _, err := Decrypt(make([]byte, 16), "anything"); err == nil {
		t.Fatal("expected ErrKeyWrongSize")
	}
}

func TestDecrypt_TruncatedCiphertext(t *testing.T) {
	key := makeKey(0x04)
	// GCM nonce is 12 bytes; 5 bytes is too short.
	short := base64.StdEncoding.EncodeToString([]byte{1, 2, 3, 4, 5})
	if _, err := Decrypt(key, short); err == nil {
		t.Fatal("decrypt of truncated ciphertext should fail")
	}
}

func TestDecrypt_BadBase64(t *testing.T) {
	key := makeKey(0x05)
	if _, err := Decrypt(key, "not!valid$base64"); err == nil {
		t.Fatal("decrypt of invalid base64 should fail")
	}
}

func TestKeyFromHex(t *testing.T) {
	cases := []struct {
		name    string
		input   string
		wantErr bool
	}{
		{"valid 64-char hex", "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20", false},
		{"too short", "abc", true},
		{"too long", "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f2020", true},
		{"non-hex chars at correct length", "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz", true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			key, err := KeyFromHex(c.input)
			if c.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if len(key) != KeySize {
				t.Errorf("len(key) = %d, want %d", len(key), KeySize)
			}
		})
	}
}

func TestKeyFromHex_RoundTripWithEncrypt(t *testing.T) {
	// Verify a key parsed from hex actually works end-to-end.
	hex := "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20"
	key, err := KeyFromHex(hex)
	if err != nil {
		t.Fatalf("KeyFromHex: %v", err)
	}
	ct, err := Encrypt(key, "hello")
	if err != nil {
		t.Fatalf("Encrypt: %v", err)
	}
	got, err := Decrypt(key, ct)
	if err != nil {
		t.Fatalf("Decrypt: %v", err)
	}
	if got != "hello" {
		t.Errorf("roundtrip mismatch: got %q want %q", got, "hello")
	}
}
