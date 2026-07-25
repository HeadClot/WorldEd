/**
 * Fetches GitHub repository contributors from the public REST API. No
 * authentication required for public repositories.
 */

const GITHUB_API_BASE = 'https://api.github.com';

const REPO_OWNER = 'Henry00IS';

const REPO_NAME = 'AiWorldEd';

/** Maximum contributors to fetch in a single request. */
const MAX_PER_PAGE = 100;

/** Represents a single GitHub contributor returned by the API. */
export interface GithubContributorInfo {
  /** GitHub username login. */
  login: string;

  /** URL to the contributor's profile avatar image. */
  avatarUrl: string;

  /** URL to the contributor's GitHub profile page. */
  profileUrl: string;

  /** Number of commit contributions to the repository. */
  contributions: number;

  /** Display name if available, falls back to login. */
  displayName: string;
}

/**
 * Builds the API endpoint URL for listing contributors.
 *
 * @returns Full URL string for the GitHub contributors endpoint.
 */
function buildContributorEndpointUrl(): string {
  return `${GITHUB_API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/contributors?per_page=${MAX_PER_PAGE}`;
}

/**
 * Builds the standard request headers for GitHub API requests.
 *
 * @returns Headers object with recommended content type and API version.
 */
function buildGitHubApiHeaders(): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/**
 * Transforms a raw GitHub API contributor response into our internal type.
 *
 * @param raw Raw contributor object from the GitHub API.
 * @returns Normalized contributor information.
 */
function normalizeContributor(raw: unknown): GithubContributorInfo | null {
  if (!raw || typeof raw !== 'object') return null;

  const obj = raw as Record<string, unknown>;

  const login = typeof obj.login === 'string' ? obj.login : null;
  const avatarUrl = typeof obj.avatar_url === 'string' ? obj.avatar_url : null;
  const htmlUrl = typeof obj.html_url === 'string' ? obj.html_url : null;
  const contributions = typeof obj.contributions === 'number' ? obj.contributions : 0;

  if (!login || !avatarUrl || !htmlUrl) return null;

  const nameField = obj.name;
  const displayName = typeof nameField === 'string' && nameField.trim().length > 0 ? nameField.trim() : login;

  return {
    login,
    avatarUrl,
    profileUrl: htmlUrl,
    contributions,
    displayName,
  };
}

/**
 * Fetches the list of contributors from GitHub. Returns an empty array on any
 * failure so the UI remains functional offline or when rate limited.
 *
 * @returns Promise resolving to an array of contributor information.
 */
export async function fetchGitHubContributors(): Promise<GithubContributorInfo[]> {
  try {
    const response = await fetch(buildContributorEndpointUrl(), {
      headers: buildGitHubApiHeaders(),
    });

    if (!response.ok) return [];

    const raw = (await response.json()) as unknown;

    if (!Array.isArray(raw)) return [];

    return raw.map(normalizeContributor).filter((item): item is GithubContributorInfo => item !== null);
  } catch {
    return [];
  }
}

/**
 * Returns the repository identifier string used in the API URL.
 *
 * @returns Owner and repo name joined with a slash.
 */
export function getRepositoryIdentifier(): string {
  return `${REPO_OWNER}/${REPO_NAME}`;
}
