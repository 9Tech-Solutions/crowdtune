import { describe, expect, it } from 'vite-plus/test'
import { parseTrackLink } from './reference'

describe('track links', () => {
  it.each([
    ['https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', 'spotify', '4uLU6hMCjMI75M1A2tKUQC'],
    ['spotify:track:4uLU6hMCjMI75M1A2tKUQC', 'spotify', '4uLU6hMCjMI75M1A2tKUQC'],
    ['https://music.youtube.com/watch?v=abcdefghijk&list=playlist', 'youtube', 'abcdefghijk'],
    ['https://youtu.be/abcdefghijk', 'youtube', 'abcdefghijk'],
    ['https://music.apple.com/us/album/example/111?i=123', 'apple-music', '123'],
    ['https://music.apple.com/us/song/example/123', 'apple-music', '123'],
  ])('parses %s', (link, provider, id) => expect(parseTrackLink(link)).toEqual({ provider, id }))
  it.each([
    'https://open.spotify.com.evil.test/track/4uLU6hMCjMI75M1A2tKUQC',
    'javascript:alert(1)',
    'http://youtu.be/abcdefghijk',
    'https://evil.test/?v=abcdefghijk',
    'https://music.apple.com/us/album/example/123',
    'https://youtube.com/playlist?list=123',
  ])('rejects %s', (link) => expect(parseTrackLink(link)).toBeNull())
})
