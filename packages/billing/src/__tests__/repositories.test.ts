import { validateAndNormalizeRepositoryUrl } from '../repositories';

describe('validateAndNormalizeRepositoryUrl', () => {
  // Helper to extract comparable parts (host, owner, repo) from a normalized URL
  // This is specific to the test's needs for comparing "sameness"
  const getRepoParts = (normalizedUrl: string | undefined): { host?: string; owner?: string; repo?: string } | null => {
    if (!normalizedUrl) return null;

    const httpMatch = normalizedUrl.match(/^https?:\/\/([\w.-]+)\/([\w.-]+)\/([\w.-]+)\.git$/i);
    if (httpMatch) {
      return { host: httpMatch[1], owner: httpMatch[2], repo: httpMatch[3] };
    }

    const sshMatch = normalizedUrl.match(/^(?:[\w.-]+@)?([\w.-]+):([\w.-]+)\/([\w.-]+)\.git$/i);
    if (sshMatch) {
      return { host: sshMatch[1], owner: sshMatch[2], repo: sshMatch[3] };
    }
    
    const sshProtocolMatch = normalizedUrl.match(/^ssh:\/\/([\w.-]+@)?([\w.-]+)\/([\w.-]+)\/([\w.-]+)\.git$/i); // Fixed regex: ssh:\/\/
    if (sshProtocolMatch) {
        // For ssh://git@host/owner/repo.git
        // match[1] is user@ (e.g., git@) - we don't need it for host comparison here
        // match[2] is host
        // match[3] is owner
        // match[4] is repo
        return { host: sshProtocolMatch[2], owner: sshProtocolMatch[3], repo: sshProtocolMatch[4] };
    }

    return null;
  };

  describe('Valid URLs', () => {
    test('should validate and normalize HTTPS URL', () => {
      const result = validateAndNormalizeRepositoryUrl('https://github.com/TestUser/TestRepo');
      expect(result.isValid).toBe(true);
      expect(result.normalizedUrl).toBe('https://github.com/testuser/testrepo.git');
    });

    test('should validate and normalize HTTPS URL with .git suffix', () => {
      const result = validateAndNormalizeRepositoryUrl('https://gitlab.com/AnotherUser/MyProject.git');
      expect(result.isValid).toBe(true);
      expect(result.normalizedUrl).toBe('https://gitlab.com/anotheruser/myproject.git');
    });

    test('should validate and normalize HTTPS URL with trailing slash', () => {
      const result = validateAndNormalizeRepositoryUrl('https://bitbucket.org/Org/RepoName/');
      expect(result.isValid).toBe(true);
      expect(result.normalizedUrl).toBe('https://bitbucket.org/org/reponame.git');
    });
    
    test('should handle uppercase in owner and repo names for HTTPS', () => {
      const result = validateAndNormalizeRepositoryUrl('https://github.com/CodeBuffAI/CodeBuff');
      expect(result.isValid).toBe(true);
      expect(result.normalizedUrl).toBe('https://github.com/codebuffai/codebuff.git');
    });

    test('should validate and normalize Git SSH URL', () => {
      const result = validateAndNormalizeRepositoryUrl('git@github.com:TestUser/TestRepo');
      expect(result.isValid).toBe(true);
      expect(result.normalizedUrl).toBe('git@github.com:testuser/testrepo.git');
    });

    test('should validate and normalize Git SSH URL with .git suffix', () => {
      const result = validateAndNormalizeRepositoryUrl('git@gitlab.com:AnotherUser/MyProject.git');
      expect(result.isValid).toBe(true);
      expect(result.normalizedUrl).toBe('git@gitlab.com:anotheruser/myproject.git');
    });

    test('should handle custom user in Git SSH URL', () => {
      const resultSimple = validateAndNormalizeRepositoryUrl('user@customhost.com:Owner/Repo');
      expect(resultSimple.isValid).toBe(true);
      expect(resultSimple.normalizedUrl).toBe('user@customhost.com:owner/repo.git');
    });

    test('should handle uppercase in owner and repo names for Git SSH', () => {
      const result = validateAndNormalizeRepositoryUrl('git@github.com:CodeBuffAI/CodeBuff.git');
      expect(result.isValid).toBe(true);
      expect(result.normalizedUrl).toBe('git@github.com:codebuffai/codebuff.git');
    });

    test('should validate and normalize SSH protocol URL', () => {
      const result = validateAndNormalizeRepositoryUrl('ssh://git@github.com/TestUser/TestRepo.git');
      expect(result.isValid).toBe(true);
      expect(result.normalizedUrl).toBe('ssh://git@github.com/testuser/testrepo.git');
    });

    test('should validate and normalize SSH protocol URL without .git and with trailing slash', () => {
      const result = validateAndNormalizeRepositoryUrl('ssh://user@custom.host/Owner/Project/');
      expect(result.isValid).toBe(true);
      expect(result.normalizedUrl).toBe('ssh://user@custom.host/owner/project.git');
    });

    test('should validate and normalize SSH protocol URL without user', () => {
      const result = validateAndNormalizeRepositoryUrl('ssh://custom.host/Owner/Project.git');
      expect(result.isValid).toBe(true);
      expect(result.normalizedUrl).toBe('ssh://git@custom.host/owner/project.git'); // Defaults to git@
    });
  });

  describe('Invalid URLs', () => {
    test('should invalidate empty string', () => {
      const result = validateAndNormalizeRepositoryUrl('');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Repository URL cannot be empty.');
    });

    test('should invalidate string with only spaces', () => {
      const result = validateAndNormalizeRepositoryUrl('   ');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Repository URL cannot be empty.');
    });

    test('should invalidate plain text', () => {
      const result = validateAndNormalizeRepositoryUrl('justsometext');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid repository URL format.');
    });

    test('should invalidate incomplete SSH URL', () => {
      const result = validateAndNormalizeRepositoryUrl('git@github.com:TestUser'); // Missing repo
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid repository URL format.');
    });

    test('should invalidate incomplete HTTPS URL', () => {
      const result = validateAndNormalizeRepositoryUrl('https://github.com/TestUser'); // Missing repo
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid repository URL format.');
    });
  });

  describe('Equivalence Tests (User Specific Request)', () => {
    test('HTTPS and Git SSH URLs for the same repo (case difference) should be considered equivalent', () => {
      const url1 = 'https://github.com/codebuffai/codebuff';
      const url2 = 'git@github.com:CodebuffAI/codebuff.git';

      const result1 = validateAndNormalizeRepositoryUrl(url1);
      const result2 = validateAndNormalizeRepositoryUrl(url2);

      expect(result1.isValid).toBe(true);
      expect(result2.isValid).toBe(true);
      
      const parts1 = getRepoParts(result1.normalizedUrl);
      const parts2 = getRepoParts(result2.normalizedUrl);

      expect(parts1).not.toBeNull();
      expect(parts2).not.toBeNull();

      expect(parts1?.host?.toLowerCase()).toBe(parts2?.host?.toLowerCase());
      expect(parts1?.owner).toBe(parts2?.owner); 
      expect(parts1?.repo).toBe(parts2?.repo);   
    });

    test('HTTPS and SSH Protocol URLs for the same repo should be considered equivalent', () => {
        const url1 = 'https://github.com/AnotherOrg/AnotherRepo.git';
        const url2 = 'ssh://git@github.com/anotherorg/anotherrepo';
  
        const result1 = validateAndNormalizeRepositoryUrl(url1);
        const result2 = validateAndNormalizeRepositoryUrl(url2);
  
        expect(result1.isValid).toBe(true);
        expect(result2.isValid).toBe(true);
        
        const parts1 = getRepoParts(result1.normalizedUrl);
        const parts2 = getRepoParts(result2.normalizedUrl);
  
        expect(parts1).not.toBeNull();
        expect(parts2).not.toBeNull();
  
        expect(parts1?.host?.toLowerCase()).toBe(parts2?.host?.toLowerCase());
        expect(parts1?.owner).toBe(parts2?.owner);
        expect(parts1?.repo).toBe(parts2?.repo);
      });
  });
});
