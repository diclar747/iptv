import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRadios } from './radio.js';

test('conserva la identidad oficial y evita duplicados entre directorios', () => {
  const official = { id: 'sanfernando', name: 'Radio San Fernando FM', url: 'https://example.org/live' };
  const directory = [
    { id: 'other', name: 'San Fernando', url: 'http://example.org/live/' },
    { id: 'third', name: 'Radio San Fernando FM', url: 'https://another.org/audio' },
    { id: 'new', name: 'ABC Cardinal', url: 'https://abc.example/live' },
  ];
  const merged = mergeRadios([official], directory);
  assert.equal(merged.length, 2);
  assert.ok(merged.some(r => r.id === 'sanfernando'));
  assert.ok(merged.some(r => r.id === 'new'));
});
