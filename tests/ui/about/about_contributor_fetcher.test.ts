import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchGitHubContributors, getRepositoryIdentifier } from '@/ui/about/about_contributor_fetcher.js';

describe('about_contributor_fetcher', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return the correct repository identifier', () => {
    expect(getRepositoryIdentifier()).toBe('Henry00IS/AiWorldEd');
  });

  it('should return normalized contributor data on successful response', async () => {
    const mockResponse = [
      {
        login: 'testuser',
        avatar_url: 'https://avatars.githubusercontent.com/testuser',
        html_url: 'https://github.com/testuser',
        contributions: 42,
        name: 'Test User',
      },
    ];

    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await fetchGitHubContributors();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const callArgs = mockFetch.mock.calls[0]!;
    expect(callArgs[0]).toContain('Henry00IS');
    expect(callArgs[0]).toContain('AiWorldEd');

    const headers = callArgs[1]?.headers as Record<string, string> | undefined;
    expect(headers?.['Accept']).toBe('application/vnd.github+json');
    expect(headers?.['X-GitHub-Api-Version']).toBeTruthy();

    expect(result).toHaveLength(1);
    expect(result[0]!.login).toBe('testuser');
    expect(result[0]!.avatarUrl).toBe('https://avatars.githubusercontent.com/testuser');
    expect(result[0]!.profileUrl).toBe('https://github.com/testuser');
    expect(result[0]!.contributions).toBe(42);
    expect(result[0]!.displayName).toBe('Test User');
  });

  it('should fall back to login when name is missing', async () => {
    const mockResponse = [
      {
        login: 'anonuser',
        avatar_url: 'https://avatars.githubusercontent.com/anonuser',
        html_url: 'https://github.com/anonuser',
        contributions: 10,
      },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await fetchGitHubContributors();
    expect(result[0]!.displayName).toBe('anonuser');
  });

  it('should return an empty array on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    const result = await fetchGitHubContributors();
    expect(result).toEqual([]);
  });

  it('should return an empty array on non-ok HTTP status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 403,
    } as Response);

    const result = await fetchGitHubContributors();
    expect(result).toEqual([]);
  });

  it('should return an empty array when response body is not an array', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'not an array' }),
    } as Response);

    const result = await fetchGitHubContributors();
    expect(result).toEqual([]);
  });

  it('should filter out contributors with missing required fields', async () => {
    const mockResponse = [
      {
        login: 'valid',
        avatar_url: 'https://example.com/avatar',
        html_url: 'https://github.com/valid',
        contributions: 5,
      },
      {
        login: null,
        avatar_url: 'https://example.com/invalid',
        html_url: 'https://github.com/invalid',
        contributions: 0,
      },
      {},
      'not_an_object',
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await fetchGitHubContributors();
    expect(result).toHaveLength(1);
    expect(result[0]!.login).toBe('valid');
  });
});
