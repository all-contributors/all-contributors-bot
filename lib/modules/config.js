const ALL_CONTRIBUTORS_RC = ".all-contributorsrc";

const { addContributorWithDetails } = require("all-contributors-cli");

const { AllContributorBotError } = require("./errors");

class Config {
  constructor(repository) {
    this.repository = repository;
  }

  ensureValid() {
    const { repo, owner } = this.repository;

    this.options.projectName = repo;
    this.options.projectOwner = owner;
    this.options.repoType = "github";
    this.options.repoHost = "https://github.com";

    if (typeof this.options.skipCi !== "boolean") {
      this.options.skipCi = true;
    }

    if (!this.options.contributors) {
      this.options.contributors = [];
    }

    if (!Array.isArray(this.options.contributors)) {
      this.options.contributors = [];
    }
  }

  async fetch() {
    const {
      content: rawOptionsFileContent,
      sha,
    } = await this.repository.getFile(ALL_CONTRIBUTORS_RC);
    this.fileSha = sha;

    try {
      this.options = JSON.parse(rawOptionsFileContent);

      this.ensureValid();

      return this.options;
    } catch (error) {
      const isSyntaxError = error instanceof SyntaxError;

      /* istanbul ignore if */
      if (!isSyntaxError) throw error;

      throw new AllContributorBotError(
        `This project's configuration file has malformed JSON: ${ALL_CONTRIBUTORS_RC}. Error:: ${error.message}`
      );
    }
  }

  init() {
    this.options = {
      files: ["README.md"],
      imageSize: 100,
      commit: false,
      commitConvention: "none",
      contributors: [],
      contributorsPerLine: 7,
    };

    this.ensureValid();
  }

  get() {
    const options = this.options;
    if (!Array.isArray(options.files)) {
      options.files = ["README.md"];
    }
    if (!Number.isInteger(options.contributorsPerLine)) {
      options.contributorsPerLine = 7;
    }
    if (!("commitConvention" in options)) {
      options.commitConvention = "none";
    }
    return options;
  }

  getRaw() {
    return `${JSON.stringify(this.options, null, 2)}\n`;
  }

  getPath() {
    return ALL_CONTRIBUTORS_RC;
  }

  getOriginalSha() {
    return this.fileSha;
  }

  _findOldContributions(username) {
    const options = this.options;

    const contributors = options.contributors;
    for (let i = 0; i < contributors.length; i++) {
      if (contributors[i].login === username) {
        return contributors[i].contributions;
      }
    }

    return [];
  }

  isContributorWithRequestedContributionTypeAlreadyExists({login, contributions}) {
    const oldContributions = this._findOldContributions(login);

    // Is there new contribution type?
    return contributions.every(contributionType => oldContributions.includes(contributionType));
  }

  async addContributor({ login, contributions, name, avatar_url, profile }) {
    const options = this.options;

    const profileWithProtocol = profile.startsWith("http")
      ? profile
      : `http://${profile}`;

    const oldContributions = this._findOldContributions(login);
    const newContributions = [
      ...new Set([...oldContributions, ...contributions]),
    ];

    const newContributorsList = await addContributorWithDetails({
      options,
      login,
      contributions: newContributions,
      name,
      avatar_url,
      profile: profileWithProtocol,
    });
    const newOptions = {
      ...options,
      contributors: newContributorsList,
    };
    this.options = newOptions;
    return newOptions;
  }
}

module.exports = Config;
