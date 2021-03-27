module.exports = addContributor;

const getUserDetails = require("./get-user-details");
const ContentFiles = require("./modules/content-files");
const convertMessage = require("commit-conv");

async function addContributor({
  context,
  commentReply,
  repository,
  config,
  who,
  contributions,
  branchName,
}) {
  // get user information
  const { id, login, name, avatar_url, profile } = await getUserDetails({
    octokit: context.octokit,
    username: who,
  });

  if(config.isContributorWithRequestedContributionTypeAlreadyExists({login: who, contributions})) {
    // let user know in comment
    const message = `@${who} already contributed before to ${contributions.join(", ")}`;

    commentReply.reply(message);
    return {}
  }

  // add user to configuration
  await config.addContributor({
    login: who,
    contributions,
    name,
    avatar_url,
    profile,
  });

  // fetch all files that are configured in .all-contributors.rc ("files" key)
  const contentFiles = new ContentFiles({
    repository,
  });
  await contentFiles.fetch(config);
  if (config.getOriginalSha() === undefined) {
    contentFiles.init();
  }
  contentFiles.generate(config);
  const filesByPathToUpdate = contentFiles.get();

  // add the `.all-contributorsrc` config file to list of files to update in PR
  filesByPathToUpdate[config.getPath()] = {
    content: config.getRaw(),
    originalSha: config.getOriginalSha(),
  };

  const convention = config.get().commitConvention;
  const prTitle = convertMessage({
    tag: "docs",
    msg: `add ${who} as a contributor`,
    convention
  });

  // create or update pull request
  const {
    pullRequestURL,
    pullCreated,
  } = await repository.createPullRequestFromFiles({
    title: prTitle,
    body: `Adds @${who} as a contributor for ${contributions.join(
      ", "
    )}.\n\nThis was requested by ${commentReply.replyingToWho()} [in this comment](${commentReply.replyingToWhere()})`,
    filesByPath: filesByPathToUpdate,
    branchName,
    convention,
  });

  // let user know in comment
  const message = pullCreated
    ? `I've put up [a pull request](${pullRequestURL}) to add @${who}! :tada:`
    : `I've updated [the pull request](${pullRequestURL}) to add @${who}! :tada:`;

  commentReply.reply(message);

  return { pullRequestURL, pullCreated, user: { id, login } };
}
