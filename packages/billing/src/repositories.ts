interface RepositoryValidationResult {
  isValid: boolean;
  normalizedUrl?: string;
  error?: string;
}

interface RepositoryParseResult {
  isValid: boolean;
  host?: string;
  owner?: string;
  repo?: string;
  error?: string;
}

/**
 * Extracts organization and repository names from a repository URL.
 * Supports HTTP, HTTPS, Git SSH, and SSH protocol URLs.
 * Returns the host, owner, and repo names in lowercase for consistent comparison.
 */
export function extractOrgAndRepoFromUrl(repositoryUrl: string): RepositoryParseResult {
  if (!repositoryUrl || typeof repositoryUrl !== 'string' || repositoryUrl.trim() === '') {
    return { isValid: false, error: 'Repository URL cannot be empty.' };
  }

  let originalInput = repositoryUrl.trim();

  // Regexes to capture components: host, owner, repo
  // HTTP/S: e.g., https://github.com/User/Repo.git
  const httpRegex = /^(https?:\/\/)(?:[\w.-]+@)?([\w.-]+)\/([\w.-]+)\/([\w.-]+?)(\.git)?\/?$/i;
  // Git SSH: e.g., git@github.com:User/Repo.git
  const gitSshRegex = /^(?:([\w.-]+)@)?([\w.-]+):([\w.-]+)\/([\w.-]+?)(\.git)?$/i;
  // SSH protocol: e.g., ssh://git@github.com/User/Repo.git
  const sshProtocolRegex = /^(ssh:\/\/)(?:([\w.-]+)@)?([\w.-]+)\/([\w.-]+)\/([\w.-]+?)(\.git)?\/?$/i;

  let match;

  if ((match = originalInput.match(httpRegex))) {
    const host = match[2].toLowerCase();
    const owner = match[3].toLowerCase();
    const repo = match[4].toLowerCase();
    return { isValid: true, host, owner, repo };
  } else if ((match = originalInput.match(gitSshRegex))) {
    const host = match[2].toLowerCase();
    const owner = match[3].toLowerCase();
    const repo = match[4].toLowerCase();
    return { isValid: true, host, owner, repo };
  } else if ((match = originalInput.match(sshProtocolRegex))) {
    const host = match[3].toLowerCase();
    const owner = match[4].toLowerCase();
    const repo = match[5].toLowerCase();
    return { isValid: true, host, owner, repo };
  }

  return { isValid: false, error: 'Invalid repository URL format. Supported formats: HTTP(S), git@host:path/repo, ssh://user@host/path/repo.' };
}

/**
 * Validates and normalizes a repository URL.
 * Supports HTTP, HTTPS, Git SSH, and SSH protocol URLs.
 * Normalizes owner and repository names to lowercase.
 * @deprecated Use extractOrgAndRepoFromUrl for new code
 */
export function validateAndNormalizeRepositoryUrl(repositoryUrl: string): RepositoryValidationResult {
  if (!repositoryUrl || typeof repositoryUrl !== 'string' || repositoryUrl.trim() === '') {
    return { isValid: false, error: 'Repository URL cannot be empty.' };
  }

  let originalInput = repositoryUrl.trim();

  // Regexes to capture components: host, owner, repo
  // HTTP/S: e.g., https://github.com/User/Repo.git
  const httpRegex = /^(https?:\/\/)(?:[\w.-]+@)?([\w.-]+)\/([\w.-]+)\/([\w.-]+?)(\.git)?\/?$/i;
  // Git SSH: e.g., git@github.com:User/Repo.git
  const gitSshRegex = /^(?:([\w.-]+)@)?([\w.-]+):([\w.-]+)\/([\w.-]+?)(\.git)?$/i;
  // SSH protocol: e.g., ssh://git@github.com/User/Repo.git
  // This regex captures: 1:protocol, 2:user (optional), 3:host, 4:owner, 5:repo, 6:.git (optional)
  const sshProtocolRegex = /^(ssh:\/\/)(?:([\w.-]+)@)?([\w.-]+)\/([\w.-]+)\/([\w.-]+?)(\.git)?\/?$/i;

  let match;
  let normalizedUrl: string;

  if ((match = originalInput.match(httpRegex))) {
    const protocol = match[1];
    const host = match[2];
    const owner = match[3].toLowerCase();
    const repo = match[4].toLowerCase();
    normalizedUrl = `${protocol}${host}/${owner}/${repo}.git`;
    return { isValid: true, normalizedUrl };
  } else if ((match = originalInput.match(gitSshRegex))) {
    const user = match[1] || 'git'; // Default to 'git' user
    const host = match[2];
    const owner = match[3].toLowerCase();
    const repo = match[4].toLowerCase();
    normalizedUrl = `${user}@${host}:${owner}/${repo}.git`;
    return { isValid: true, normalizedUrl };
  } else if ((match = originalInput.match(sshProtocolRegex))) {
    const protocolPart = match[1]; // "ssh://"
    const userPart = match[2] ? `${match[2]}@` : 'git@'; // Default to git@ if user is not in URL
    const hostPart = match[3];
    const ownerPart = match[4].toLowerCase();
    const repoPart = match[5].toLowerCase();
    normalizedUrl = `${protocolPart}${userPart}${hostPart}/${ownerPart}/${repoPart}.git`;
    return { isValid: true, normalizedUrl };
  }

  return { isValid: false, error: 'Invalid repository URL format. Supported formats: HTTP(S), git@host:path/repo, ssh://user@host/path/repo.' };
}
