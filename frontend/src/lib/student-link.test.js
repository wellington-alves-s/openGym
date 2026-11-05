// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { joinLinkUrl, joinTokenFromSearch, stripJoinFromUrl } from './student-link.js'

describe('joinTokenFromSearch', () => {
  it('reads ?join= from the query string', () => {
    expect(joinTokenFromSearch('?join=X&a=1')).toBe('X')
    expect(joinTokenFromSearch('join=X')).toBe('X')
  })

  it('returns empty when there is no join', () => {
    expect(joinTokenFromSearch('')).toBe('')
    expect(joinTokenFromSearch('?link=abc&a=1')).toBe('')
  })

  it('decodes a percent-encoded code', () => {
    expect(joinTokenFromSearch('?join=AB%2B12')).toBe('AB+12')
  })
})

describe('joinLinkUrl', () => {
  it('puts the code on the app’s own address as ?join=, and reads back to the same code', () => {
    const url = joinLinkUrl('K7WQ-2MZP-4HXA', { origin: 'https://gym.example.com', pathname: '/' })
    expect(url).toBe('https://gym.example.com/?join=K7WQ-2MZP-4HXA')
    expect(joinTokenFromSearch(new URL(url).search)).toBe('K7WQ-2MZP-4HXA')
  })

  it('encodes the code and keeps a subpath deployment’s path, dropping query and route', () => {
    expect(joinLinkUrl('AB-12', { origin: 'https://example.com', pathname: '/gym/', search: '?x=1', hash: '#/settings' }))
      .toBe('https://example.com/gym/?join=AB-12')
    expect(joinLinkUrl('A B+1', { origin: 'https://example.com', pathname: '/gym/' }))
      .toBe('https://example.com/gym/?join=A%20B%2B1')
  })
})

describe('stripJoinFromUrl', () => {
  afterEach(() => vi.restoreAllMocks())

  it('drops only join and keeps the other parameters and the hash', () => {
    window.history.replaceState({}, '', '/gym/?join=AB-12&a=1#/home')
    const spy = vi.spyOn(history, 'replaceState')
    stripJoinFromUrl()
    expect(spy).toHaveBeenCalledWith({}, '', '/gym/?a=1#/home')
    expect(window.location.search).toBe('?a=1')
  })

  it('leaves a bare path when join was the only parameter', () => {
    window.history.replaceState({}, '', '/?join=AB-12')
    stripJoinFromUrl()
    expect(window.location.pathname + window.location.search).toBe('/')
  })

  it('does nothing when there is no join', () => {
    window.history.replaceState({}, '', '/?a=1')
    const spy = vi.spyOn(history, 'replaceState')
    stripJoinFromUrl()
    expect(spy).not.toHaveBeenCalled()
  })
})
