package handlers

import (
	"crypto/rand"
	"math/big"
)

const shortCodeAlphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
const shortCodeLen = 6

// generateShortCode returns a cryptographically random 6-character
// alphanumeric string drawn from a 62-character alphabet (a-z A-Z 0-9).
func generateShortCode() (string, error) {
	alphabetLen := big.NewInt(int64(len(shortCodeAlphabet)))
	buf := make([]byte, shortCodeLen)
	for i := range buf {
		n, err := rand.Int(rand.Reader, alphabetLen)
		if err != nil {
			return "", err
		}
		buf[i] = shortCodeAlphabet[n.Int64()]
	}
	return string(buf), nil
}
