import { extractOrgAndRepoFromUrl } from '../repositories';

describe('extractOrgAndRepoFromUrl', () => {
  describe('Valid URLs', () => {
    test('should extract org and repo from HTTPS URL', () => {
      const result = extractOrgAndRepoFromUrl('https://github.com/TestUser/TestRepo');
      expect(result.isValid).toBe(true);
      expect(result.host).toBe('github.com');
      expect(result.owner).toBe('testuser');
      expect(result.repo).toBe('testrepo');
    });

    test('should extract org and repo from HTTPS URL with .git suffix', () => {
      const result = extractOrgAndRepoFromUrl('https://gitlab.com/AnotherUser/MyProject.git');
      expect(result.isValid).toBe(true);
      expect(result.host).toBe('gitlab.com');
      expect(result.owner).toBe('anotheruser');
      expect(result.repo).toBe('myproject');
    });

    test('should extract org and repo from HTTPS URL with trailing slash', () => {
      const result = extractOrgAndRepoFromUrl('https://bitbucket.org/Org/RepoName/');
      expect(result.isValid).toBe(true);
      expect(result.host).toBe('bitbucket.org');
      expect(result.owner).toBe('org');
      expect(result.repo).toBe('reponame');
    });

    test('should handle uppercase in owner and repo names for HTTPS', () => {
      const result = extractOrgAndRepoFromUrl('https://github.com/CodeBuffAI/CodeBuff');
      expect(result.isValid).toBe(true);
      expect(result.host).toBe('github.com');
      expect(result.owner).toBe('codebuffai');
      expect(result.repo).toBe('codebuff');
    });

    test('should extract org and repo from Git SSH URL', () => {
      const result = extractOrgAndRepoFromUrl('git@github.com:TestUser/TestRepo');
      expect(result.isValid).toBe(true);
      expect(result.host).toBe('github.com');
      expect(result.owner).toBe('testuser');
      expect(result.repo).toBe('testrepo');
    });

    test('should extract org and repo from Git SSH URL with .git suffix', () => {
      const result = extractOrgAndRepoFromUrl('git@gitlab.com:AnotherUser/MyProject.git');
      expect(result.isValid).toBe(true);
      expect(result.host).toBe('gitlab.com');
      expect(result.owner).toBe('anotheruser');
      expect(result.repo).toBe('myproject');
    });

    test('should handle custom user in Git SSH URL', () => {
      const result = extractOrgAndRepoFromUrl('user@customhost.com:Owner/Repo');
      expect(result.isValid).toBe(true);
      expect(result.host).toBe('customhost.com');
      expect(result.owner).toBe('owner');
      expect(result.repo).toBe('repo');
    });

    test('should handle uppercase in owner and repo names for Git SSH', () => {
      const result = extractOrgAndRepoFromUrl('git@github.com:CodeBuffAI/CodeBuff.git');
      expect(result.isValid).toBe(true);
      expect(result.host).toBe('github.com');
      expect(result.owner).toBe('codebuffai');
      expect(result.repo).toBe('codebuff');
    });

    test('should extract org and repo from SSH protocol URL', () => {
      const result = extractOrgAndRepoFromUrl('ssh://git@github.com/TestUser/TestRepo.git');
      expect(result.isValid).toBe(true);
      expect(result.host).toBe('github.com');
      expect(result.owner).toBe('testuser');
      expect(result.repo).toBe('testrepo');
    });

    test('should extract org and repo from SSH protocol URL without .git and with trailing slash', () => {
      const result = extractOrgAndRepoFromUrl('ssh://user@custom.host/Owner/Project/');
      expect(result.isValid).toBe(true);
      expect(result.host).toBe('custom.host');
      expect(result.owner).toBe('owner');
      expect(result.repo).toBe('project');
    });

    test('should extract org and repo from SSH protocol URL without user', () => {
      const result = extractOrgAndRepoFromUrl('ssh://custom.host/Owner/Project.git');
      expect(result.isValid).toBe(true);
      expect(result.host).toBe('custom.host');
      expect(result.owner).toBe('owner');
      expect(result.repo).toBe('project');
    });
  });

  describe('Invalid URLs', () => {
    test('should invalidate empty string', () => {
      const result = extractOrgAndRepoFromUrl('');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Repository URL cannot be empty.');
    });

    test('should invalidate string with only spaces', () => {
      const result = extractOrgAndRepoFromUrl('   ');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Repository URL cannot be empty.');
    });

    test('should invalidate plain text', () => {
      const result = extractOrgAndRepoFromUrl('justsometext');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid repository URL format.');
    });

    test('should invalidate incomplete SSH URL', () => {
      const result = extractOrgAndRepoFromUrl('git@github.com:TestUser'); // Missing repo
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid repository URL format.');
    });

    test('should invalidate incomplete HTTPS URL', () => {
      const result = extractOrgAndRepoFromUrl('https://github.com/TestUser'); // Missing repo
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid repository URL format.');
    });
  });

  describe('Equivalence Tests', () => {
    test('HTTPS and Git SSH URLs for the same repo (case difference) should extract same org/repo', () => {
      const url1 = 'https://github.com/codebuffai/codebuff';
      const url2 = 'git@github.com:CodebuffAI/codebuff.git';

      const result1 = extractOrgAndRepoFromUrl(url1);
      const result2 = extractOrgAndRepoFromUrl(url2);

      expect(result1.isValid).toBe(true);
      expect(result2.isValid).toBe(true);
      
      expect(result1.host).toBe(result2.host);
      expect(result1.owner).toBe(result2.owner);
      expect(result1.repo).toBe(result2.repo);
    });

    test('HTTPS and SSH Protocol URLs for the same repo should extract same org/repo', () => {
      const url1 = 'https://github.com/AnotherOrg/AnotherRepo.git';
      const url2 = 'ssh://git@github.com/anotherorg/anotherrepo';

      const result1 = extractOrgAndRepoFromUrl(url1);
      const result2 = extractOrgAndRepoFromUrl(url2);

      expect(result1.isValid).toBe(true);
      expect(result2.isValid).toBe(true);
      
      expect(result1.host).toBe(result2.host);
      expect(result1.owner).toBe(result2.owner);
      expect(result1.repo).toBe(result2.repo);
    });
  });
});
