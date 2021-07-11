module.exports = setupRepository;

const Repository = require("./modules/repository");
const { BranchNotFoundError } = require("./modules/errors");

async function setupRepository({ context, branchName }) {
  const repository = new Repository(context);

  const hasBranch = async (branchName) => {
    try {
      await repository.getRef(branchName);
      return true;
    } catch (error) {
      const isBranchNotFoundError = error instanceof BranchNotFoundError;

      /* istanbul ignore if */
      if (!isBranchNotFoundError) {
        throw error;
      }
    }
    return false;
  };

  const hasOpenPull = async (branchName) => {
    const result = await repository.getPullRequestsBy({
      branchName,
      state: "open",
    });

    // TODO: Possibly make sure the existing pull request is created by the bot?
    return !!result.data?.length;
  };

  const branchExists = await hasBranch(branchName);
  if (branchExists) {
    const openPrExists = await hasOpenPull(branchName);
    if (openPrExists) {
      context.log.debug(
        `Branch "${branchName}" exists with an open pull request, will work from this branch`
      );
      repository.setBaseBranch(branchName);
      return
    }
    context.log.debug(
      `Branch "${branchName}" exists but theres no open pull request for it, will work from default branch`
    );
  } else {
    context.log.debug(
      `Branch "${branchName}" does not exist, will work from default branch`
    );
  }

  return repository;
}
