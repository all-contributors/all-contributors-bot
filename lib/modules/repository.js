const {
  AllContributorBotError,
  BranchNotFoundError,
  ResourceNotFoundError,
} = require("./errors");
const convertMessage = require("commit-conv");

class Repository {
  /**
   * @param {import('probot').Context} context
   */
  constructor(context) {
    const defaultBranch = context.payload.repository.default_branch;
    const { repo, owner, octokit, log } = {
      ...context.repo(),
      octokit: context.octokit,
      log: context.log,
    };

    this.octokit = octokit;
    this.repo = repo;
    this.owner = owner;
    this.defaultBranch = defaultBranch;
    this.baseBranch = defaultBranch;
    this.log = log;
    this.skipCiString = "[skip ci]";
  }

  getFullname() {
    return `${this.owner}/${this.repo}`;
  }

  setBaseBranch(branchName) {
    this.baseBranch = branchName;
  }

  setSkipCi(skipCi) {
    this.skipCiString = skipCi ? "[skip ci]" : "";
  }

  async getFile(filePath) {
    try {
      // https://octokit.github.io/rest.js/#api-Repos-getContents
      const file = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: filePath,
        ref: this.baseBranch,
      });
      // Contents can be an array if its a directory, should be an edge case, and we can just crash
      const contentBinary = file.data.content;
      const content = Buffer.from(contentBinary, "base64").toString();
      return {
        content,
        sha: file.data.sha,
      };
    } catch (error) {
      /* istanbul ignore if */
      if (error.status !== 404) {
        throw error;
      }

      throw new ResourceNotFoundError(filePath, this.getFullname());
    }
  }

  async getMultipleFiles(filePathsArray) {
    // TODO: can probably optimise this instead of sending a request per file
    const repository = this;

    const getFilesMultiple = filePathsArray.map((filePath) => {
      return repository.getFile(filePath).then(({ content, sha }) => ({
        filePath,
        content,
        sha,
      }));
    });

    const getFilesMultipleList = await Promise.all(getFilesMultiple);
    const multipleFilesByPath = {};
    getFilesMultipleList.forEach(({ filePath, content, sha }) => {
      multipleFilesByPath[filePath] = {
        content,
        sha,
      };
    });

    return multipleFilesByPath;
  }

  async getRef(branchName) {
    try {
      const result = await this.octokit.git.getRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${branchName}`,
      });
      return result.data.object.sha;
    } catch (error) {
      /* istanbul ignore if */
      if (error.status !== 404) {
        throw error;
      }

      throw new BranchNotFoundError(branchName);
    }
  }

  async createBranch(branchName) {
    const fromSha = await this.getRef(this.defaultBranch);

    // https://octokit.github.io/rest.js/#api-Git-createRef
    await this.octokit.git.createRef({
      owner: this.owner,
      repo: this.repo,
      ref: `refs/heads/${branchName}`,
      sha: fromSha,
    });
  }

  async updateFile({ filePath, content, branchName, originalSha, convention }) {
    const contentBinary = Buffer.from(content).toString("base64");

    //octokit.github.io/rest.js/#api-Repos-updateFile
    await this.octokit.repos.createOrUpdateFileContents({
      owner: this.owner,
      repo: this.repo,
      path: filePath,
      message: convertMessage({
        tag: "docs",
        msg: `update ${filePath} ${this.skipCiString}`,
        convention,
      }).trim(),
      content: contentBinary,
      sha: originalSha,
      branch: branchName,
    });
  }

  async createFile({ filePath, content, branchName, convention }) {
    const contentBinary = Buffer.from(content).toString("base64");

    //octokit.github.io/rest.js/#api-Repos-createFile
    await this.octokit.repos.createOrUpdateFileContents({
      owner: this.owner,
      repo: this.repo,
      path: filePath,
      message: convertMessage({
        tag: "docs",
        msg: `create ${filePath} ${this.skipCiString}`,
        convention,
      }).trim(),
      content: contentBinary,
      branch: branchName,
    });
  }

  async createOrUpdateFile({
    filePath,
    content,
    branchName,
    originalSha,
    convention,
  }) {
    if (originalSha === undefined) {
      await this.createFile({ filePath, content, branchName, convention });
    } else {
      await this.updateFile({
        filePath,
        content,
        branchName,
        originalSha,
        convention,
      });
    }
  }

  async createOrUpdateFiles({ filesByPath, branchName, convention }) {
    const repository = this;
    const createOrUpdateFilesMultiple = Object.entries(filesByPath).map(
      ([filePath, { content, originalSha }]) => {
        return repository.createOrUpdateFile({
          filePath,
          content,
          branchName,
          originalSha,
          convention,
        });
      }
    );

    await Promise.all(createOrUpdateFilesMultiple);
  }

  async getPullRequestURL({ branchName }) {
    try {
      const results = await this.octokit.pulls.list({
        owner: this.owner,
        repo: this.repo,
        state: "open",
        head: `${this.owner}:${branchName}`,
      });
      return results.data[0].html_url;
    } catch (error) {
      // TODO: can probably be removed, see https://github.com/all-contributors/all-contributors-bot/pull/109/files#r549495665

      // Hard fail, but recoverable (not ideal for UX)
      throw new AllContributorBotError(
        `A pull request is already open for the branch \`${branchName}\`.`
      );
    }
  }

  async createPullRequest({ title, body, branchName }) {
    this.log.debug("Creating pull request");
    try {
      const result = await this.octokit.pulls.create({
        owner: this.owner,
        repo: this.repo,
        title,
        body,
        head: branchName,
        base: this.defaultBranch,
        maintainer_can_modify: true,
      });
      return {
        pullRequestURL: result.data.html_url,
        pullCreated: true,
      };
    } catch (error) {
      /* istanbul ignore if */
      if (error.status !== 422) {
        throw error;
      }

      this.log.debug("Pull request is already open, finding pull request...");
      const pullRequestURL = await this.getPullRequestURL({
        branchName,
      });
      return {
        pullRequestURL,
        pullCreated: false,
      };
    }
  }

  async createPullRequestFromFiles({
    title,
    body,
    filesByPath,
    branchName,
    convention,
  }) {
    const branchNameExists = branchName === this.baseBranch;
    if (!branchNameExists) {
      await this.createBranch(branchName);
    }

    await this.createOrUpdateFiles({
      filesByPath,
      branchName,
      convention,
    });

    return this.createPullRequest({
      title,
      body,
      branchName,
    });
  }
}

module.exports = Repository;
