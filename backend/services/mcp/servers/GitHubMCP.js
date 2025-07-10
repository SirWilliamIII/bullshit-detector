/**
 * GitHub MCP Server
 * Provides repository automation and code management capabilities
 */
const BaseMCPServer = require('../BaseMCPServer');
const { Octokit } = require('@octokit/rest');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class GitHubMCP extends BaseMCPServer {
  constructor(config = {}) {
    super({
      name: 'GitHub MCP',
      version: '1.0.0',
      description: 'Repository automation and code management capabilities',
      capabilities: [
        'code_management',
        'create_repository',
        'list_repositories',
        'create_issue',
        'list_issues',
        'create_pull_request',
        'list_pull_requests',
        'get_file_content',
        'update_file',
        'search_code',
        'get_commits',
        'create_branch',
        'merge_pull_request',
        'get_repository_stats'
      ]
    });

    this.token = config.token || process.env.GITHUB_TOKEN;
    this.username = config.username || process.env.GITHUB_USERNAME;
    this.octokit = null;
    this.authenticated = false;
  }

  /**
   * Initialize GitHub client
   */
  async initialize() {
    if (!this.token) {
      throw new Error('GitHub token is required. Set GITHUB_TOKEN environment variable.');
    }

    this.octokit = new Octokit({
      auth: this.token,
      userAgent: 'GitHub MCP Server v1.0.0'
    });

    // Test authentication
    try {
      const { data: user } = await this.octokit.rest.users.getAuthenticated();
      this.username = user.login;
      this.authenticated = true;
      this.log('info', `Authenticated as ${user.login}`);
    } catch (error) {
      throw new Error(`GitHub authentication failed: ${error.message}`);
    }

    await super.initialize();
  }

  /**
   * Execute GitHub capability
   */
  async execute(capability, parameters = {}) {
    if (!this.authenticated) {
      throw new Error('GitHub MCP not authenticated');
    }

    return this.executeWithMetrics(capability, parameters, async (cap, params) => {
      switch (cap) {
        case 'code_management':
        case 'create_repository':
          return await this.createRepository(params);
        case 'list_repositories':
          return await this.listRepositories(params);
        case 'create_issue':
          return await this.createIssue(params);
        case 'list_issues':
          return await this.listIssues(params);
        case 'create_pull_request':
          return await this.createPullRequest(params);
        case 'list_pull_requests':
          return await this.listPullRequests(params);
        case 'get_file_content':
          return await this.getFileContent(params);
        case 'update_file':
          return await this.updateFile(params);
        case 'search_code':
          return await this.searchCode(params);
        case 'get_commits':
          return await this.getCommits(params);
        case 'create_branch':
          return await this.createBranch(params);
        case 'merge_pull_request':
          return await this.mergePullRequest(params);
        case 'get_repository_stats':
          return await this.getRepositoryStats(params);
        default:
          throw new Error(`Unknown capability: ${cap}`);
      }
    });
  }

  /**
   * Create a new repository
   */
  async createRepository(params) {
    this.validateParameters(params, {
      name: { type: 'string', required: true },
      description: { type: 'string', required: false },
      private: { type: 'boolean', required: false },
      auto_init: { type: 'boolean', required: false },
      gitignore_template: { type: 'string', required: false },
      license_template: { type: 'string', required: false }
    });

    const { data: repo } = await this.octokit.rest.repos.createForAuthenticatedUser({
      name: params.name,
      description: params.description || '',
      private: params.private || false,
      auto_init: params.auto_init || true,
      gitignore_template: params.gitignore_template,
      license_template: params.license_template
    });

    return {
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      description: repo.description,
      url: repo.html_url,
      clone_url: repo.clone_url,
      ssh_url: repo.ssh_url,
      private: repo.private,
      created_at: repo.created_at
    };
  }

  /**
   * List repositories
   */
  async listRepositories(params) {
    this.validateParameters(params, {
      type: { type: 'string', required: false }, // 'all', 'owner', 'public', 'private', 'member'
      sort: { type: 'string', required: false }, // 'created', 'updated', 'pushed', 'full_name'
      direction: { type: 'string', required: false }, // 'asc', 'desc'
      per_page: { type: 'number', required: false },
      page: { type: 'number', required: false }
    });

    const { data: repos } = await this.octokit.rest.repos.listForAuthenticatedUser({
      type: params.type || 'owner',
      sort: params.sort || 'updated',
      direction: params.direction || 'desc',
      per_page: Math.min(params.per_page || 30, 100),
      page: params.page || 1
    });

    return {
      repositories: repos.map(repo => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        description: repo.description,
        url: repo.html_url,
        private: repo.private,
        language: repo.language,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        updated_at: repo.updated_at,
        created_at: repo.created_at
      })),
      total: repos.length
    };
  }

  /**
   * Create an issue
   */
  async createIssue(params) {
    this.validateParameters(params, {
      owner: { type: 'string', required: true },
      repo: { type: 'string', required: true },
      title: { type: 'string', required: true },
      body: { type: 'string', required: false },
      labels: { type: 'object', required: false },
      assignees: { type: 'object', required: false }
    });

    const { data: issue } = await this.octokit.rest.issues.create({
      owner: params.owner,
      repo: params.repo,
      title: params.title,
      body: params.body || '',
      labels: params.labels || [],
      assignees: params.assignees || []
    });

    return {
      id: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      url: issue.html_url,
      labels: issue.labels.map(label => label.name),
      assignees: issue.assignees.map(assignee => assignee.login),
      created_at: issue.created_at
    };
  }

  /**
   * List issues
   */
  async listIssues(params) {
    this.validateParameters(params, {
      owner: { type: 'string', required: true },
      repo: { type: 'string', required: true },
      state: { type: 'string', required: false }, // 'open', 'closed', 'all'
      labels: { type: 'string', required: false },
      sort: { type: 'string', required: false },
      direction: { type: 'string', required: false },
      per_page: { type: 'number', required: false }
    });

    const { data: issues } = await this.octokit.rest.issues.listForRepo({
      owner: params.owner,
      repo: params.repo,
      state: params.state || 'open',
      labels: params.labels,
      sort: params.sort || 'created',
      direction: params.direction || 'desc',
      per_page: Math.min(params.per_page || 30, 100)
    });

    return {
      issues: issues.map(issue => ({
        id: issue.id,
        number: issue.number,
        title: issue.title,
        state: issue.state,
        url: issue.html_url,
        labels: issue.labels.map(label => label.name),
        assignees: issue.assignees.map(assignee => assignee.login),
        comments: issue.comments,
        created_at: issue.created_at,
        updated_at: issue.updated_at
      })),
      total: issues.length
    };
  }

  /**
   * Create a pull request
   */
  async createPullRequest(params) {
    this.validateParameters(params, {
      owner: { type: 'string', required: true },
      repo: { type: 'string', required: true },
      title: { type: 'string', required: true },
      head: { type: 'string', required: true },
      base: { type: 'string', required: true },
      body: { type: 'string', required: false },
      draft: { type: 'boolean', required: false }
    });

    const { data: pr } = await this.octokit.rest.pulls.create({
      owner: params.owner,
      repo: params.repo,
      title: params.title,
      head: params.head,
      base: params.base,
      body: params.body || '',
      draft: params.draft || false
    });

    return {
      id: pr.id,
      number: pr.number,
      title: pr.title,
      state: pr.state,
      url: pr.html_url,
      head: pr.head.ref,
      base: pr.base.ref,
      mergeable: pr.mergeable,
      draft: pr.draft,
      created_at: pr.created_at
    };
  }

  /**
   * List pull requests
   */
  async listPullRequests(params) {
    this.validateParameters(params, {
      owner: { type: 'string', required: true },
      repo: { type: 'string', required: true },
      state: { type: 'string', required: false },
      sort: { type: 'string', required: false },
      direction: { type: 'string', required: false }
    });

    const { data: prs } = await this.octokit.rest.pulls.list({
      owner: params.owner,
      repo: params.repo,
      state: params.state || 'open',
      sort: params.sort || 'created',
      direction: params.direction || 'desc',
      per_page: 30
    });

    return {
      pull_requests: prs.map(pr => ({
        id: pr.id,
        number: pr.number,
        title: pr.title,
        state: pr.state,
        url: pr.html_url,
        head: pr.head.ref,
        base: pr.base.ref,
        mergeable: pr.mergeable,
        draft: pr.draft,
        created_at: pr.created_at,
        updated_at: pr.updated_at
      })),
      total: prs.length
    };
  }

  /**
   * Get file content
   */
  async getFileContent(params) {
    this.validateParameters(params, {
      owner: { type: 'string', required: true },
      repo: { type: 'string', required: true },
      path: { type: 'string', required: true },
      ref: { type: 'string', required: false }
    });

    const { data: file } = await this.octokit.rest.repos.getContent({
      owner: params.owner,
      repo: params.repo,
      path: params.path,
      ref: params.ref
    });

    // Handle directory vs file
    if (Array.isArray(file)) {
      return {
        type: 'directory',
        path: params.path,
        contents: file.map(item => ({
          name: item.name,
          path: item.path,
          type: item.type,
          size: item.size,
          url: item.html_url
        }))
      };
    }

    // Decode file content
    const content = file.encoding === 'base64' 
      ? Buffer.from(file.content, 'base64').toString('utf8')
      : file.content;

    return {
      type: 'file',
      path: file.path,
      name: file.name,
      size: file.size,
      content,
      sha: file.sha,
      url: file.html_url,
      encoding: file.encoding
    };
  }

  /**
   * Update file content
   */
  async updateFile(params) {
    this.validateParameters(params, {
      owner: { type: 'string', required: true },
      repo: { type: 'string', required: true },
      path: { type: 'string', required: true },
      content: { type: 'string', required: true },
      message: { type: 'string', required: true },
      sha: { type: 'string', required: false },
      branch: { type: 'string', required: false }
    });

    // Get current file SHA if not provided
    let sha = params.sha;
    if (!sha) {
      try {
        const { data: file } = await this.octokit.rest.repos.getContent({
          owner: params.owner,
          repo: params.repo,
          path: params.path,
          ref: params.branch
        });
        sha = file.sha;
      } catch (error) {
        // File doesn't exist, that's fine for new files
      }
    }

    const requestData = {
      owner: params.owner,
      repo: params.repo,
      path: params.path,
      message: params.message,
      content: Buffer.from(params.content).toString('base64')
    };

    if (sha) {
      requestData.sha = sha;
    }

    if (params.branch) {
      requestData.branch = params.branch;
    }

    const { data: result } = await this.octokit.rest.repos.createOrUpdateFileContents(requestData);

    return {
      path: params.path,
      sha: result.content.sha,
      url: result.content.html_url,
      commit: {
        sha: result.commit.sha,
        url: result.commit.html_url,
        message: result.commit.message
      }
    };
  }

  /**
   * Search code
   */
  async searchCode(params) {
    this.validateParameters(params, {
      q: { type: 'string', required: true },
      sort: { type: 'string', required: false },
      order: { type: 'string', required: false },
      per_page: { type: 'number', required: false }
    });

    const { data: results } = await this.octokit.rest.search.code({
      q: params.q,
      sort: params.sort || 'indexed',
      order: params.order || 'desc',
      per_page: Math.min(params.per_page || 30, 100)
    });

    return {
      total_count: results.total_count,
      items: results.items.map(item => ({
        name: item.name,
        path: item.path,
        sha: item.sha,
        url: item.html_url,
        repository: {
          name: item.repository.name,
          full_name: item.repository.full_name,
          url: item.repository.html_url
        },
        score: item.score
      }))
    };
  }

  /**
   * Get commits
   */
  async getCommits(params) {
    this.validateParameters(params, {
      owner: { type: 'string', required: true },
      repo: { type: 'string', required: true },
      sha: { type: 'string', required: false },
      path: { type: 'string', required: false },
      since: { type: 'string', required: false },
      until: { type: 'string', required: false },
      per_page: { type: 'number', required: false }
    });

    const { data: commits } = await this.octokit.rest.repos.listCommits({
      owner: params.owner,
      repo: params.repo,
      sha: params.sha,
      path: params.path,
      since: params.since,
      until: params.until,
      per_page: Math.min(params.per_page || 30, 100)
    });

    return {
      commits: commits.map(commit => ({
        sha: commit.sha,
        message: commit.commit.message,
        author: {
          name: commit.commit.author.name,
          email: commit.commit.author.email,
          date: commit.commit.author.date
        },
        committer: {
          name: commit.commit.committer.name,
          email: commit.commit.committer.email,
          date: commit.commit.committer.date
        },
        url: commit.html_url,
        stats: commit.stats
      })),
      total: commits.length
    };
  }

  /**
   * Create a new branch
   */
  async createBranch(params) {
    this.validateParameters(params, {
      owner: { type: 'string', required: true },
      repo: { type: 'string', required: true },
      branch: { type: 'string', required: true },
      from_branch: { type: 'string', required: false }
    });

    // Get the SHA of the branch to create from
    const fromBranch = params.from_branch || 'main';
    const { data: ref } = await this.octokit.rest.git.getRef({
      owner: params.owner,
      repo: params.repo,
      ref: `heads/${fromBranch}`
    });

    // Create new branch
    const { data: newRef } = await this.octokit.rest.git.createRef({
      owner: params.owner,
      repo: params.repo,
      ref: `refs/heads/${params.branch}`,
      sha: ref.object.sha
    });

    return {
      branch: params.branch,
      sha: newRef.object.sha,
      url: newRef.url,
      from_branch: fromBranch
    };
  }

  /**
   * Merge pull request
   */
  async mergePullRequest(params) {
    this.validateParameters(params, {
      owner: { type: 'string', required: true },
      repo: { type: 'string', required: true },
      pull_number: { type: 'number', required: true },
      commit_title: { type: 'string', required: false },
      commit_message: { type: 'string', required: false },
      merge_method: { type: 'string', required: false } // 'merge', 'squash', 'rebase'
    });

    const { data: result } = await this.octokit.rest.pulls.merge({
      owner: params.owner,
      repo: params.repo,
      pull_number: params.pull_number,
      commit_title: params.commit_title,
      commit_message: params.commit_message,
      merge_method: params.merge_method || 'merge'
    });

    return {
      merged: result.merged,
      sha: result.sha,
      message: result.message
    };
  }

  /**
   * Get repository statistics
   */
  async getRepositoryStats(params) {
    this.validateParameters(params, {
      owner: { type: 'string', required: true },
      repo: { type: 'string', required: true }
    });

    // Get repository details
    const { data: repo } = await this.octokit.rest.repos.get({
      owner: params.owner,
      repo: params.repo
    });

    // Get language statistics
    const { data: languages } = await this.octokit.rest.repos.listLanguages({
      owner: params.owner,
      repo: params.repo
    });

    // Get contributors
    const { data: contributors } = await this.octokit.rest.repos.listContributors({
      owner: params.owner,
      repo: params.repo,
      per_page: 10
    });

    return {
      name: repo.name,
      full_name: repo.full_name,
      description: repo.description,
      url: repo.html_url,
      private: repo.private,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      watchers: repo.watchers_count,
      open_issues: repo.open_issues_count,
      size: repo.size,
      default_branch: repo.default_branch,
      languages,
      contributors: contributors.slice(0, 5).map(contributor => ({
        login: contributor.login,
        contributions: contributor.contributions,
        url: contributor.html_url
      })),
      created_at: repo.created_at,
      updated_at: repo.updated_at,
      pushed_at: repo.pushed_at
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      if (!this.authenticated) {
        return {
          healthy: false,
          error: 'Not authenticated'
        };
      }

      // Test API access
      await this.octokit.rest.users.getAuthenticated();
      
      return {
        healthy: true,
        authenticated: this.authenticated,
        username: this.username,
        ...await super.healthCheck()
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        authenticated: false
      };
    }
  }

  /**
   * Get capability descriptions
   */
  getCapabilityDescription(capability) {
    const descriptions = {
      create_repository: 'Create a new GitHub repository',
      list_repositories: 'List user repositories',
      create_issue: 'Create a new issue in a repository',
      list_issues: 'List issues in a repository',
      create_pull_request: 'Create a new pull request',
      list_pull_requests: 'List pull requests in a repository',
      get_file_content: 'Get content of a file from repository',
      update_file: 'Update or create a file in repository',
      search_code: 'Search for code across GitHub',
      get_commits: 'Get commit history for a repository',
      create_branch: 'Create a new branch',
      merge_pull_request: 'Merge a pull request',
      get_repository_stats: 'Get detailed repository statistics'
    };
    
    return descriptions[capability] || super.getCapabilityDescription(capability);
  }
}

module.exports = GitHubMCP;