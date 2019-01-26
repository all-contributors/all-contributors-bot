const CommentReply = require('./CommentReply')
const Repository = require('./Repository')
const OptionsConfig = require('./OptionsConfig')
const ContentFiles = require('./ContentFiles')

const getUserDetails = require('./utils/getUserDetails')
const parseComment = require('./utils/parse-comment')

const {
    AllContributorBotError,
    BranchNotFoundError,
    ResourceNotFoundError,
} = require('./utils/errors')

const getSafeRef = require('./utils/git/getSafeRef')

async function processAddContributor({
    context,
    commentReply,
    repository,
    optionsConfig,
    who,
    contributions,
}) {
    const { name, avatar_url, profile } = await getUserDetails({
        github: context.github,
        username: who,
    })

    await optionsConfig.addContributor({
        login: who,
        contributions,
        name,
        avatar_url,
        profile,
    })

    const safeWho = getSafeRef(who)
    const branchName = `all-contributors/add-${safeWho}`
    try {
        await repository.getRef(branchName)
        context.log.info(
            `Branch: ${branchName} EXISTS, will work from this branch`,
        )
        repository.setBaseBranch(branchName)
    } catch (error) {
        if (error instanceof BranchNotFoundError) {
            context.log.info(
                `Branch: ${branchName} DOES NOT EXIST, will work from default branch`,
            )
        } else {
            throw error
        }
    }

    const contentFiles = new ContentFiles({
        repository,
    })
    await contentFiles.fetch(optionsConfig)
    if (optionsConfig.getOriginalSha() === undefined) {
        contentFiles.init()
    }
    contentFiles.generate(optionsConfig)
    const filesByPathToUpdate = contentFiles.get()
    filesByPathToUpdate[optionsConfig.getPath()] = {
        content: optionsConfig.getRaw(),
        originalSha: optionsConfig.getOriginalSha(),
    }

    const pullRequestURL = await repository.createPullRequestFromFiles({
        title: `docs: add ${who} as a contributor`,
        body: `Adds @${who} as a contributor for ${contributions.join(
            ', ',
        )}.\n\nThis was requested by ${commentReply.replyingToWho()} [in this comment](${commentReply.replyingToWhere()})`,
        filesByPath: filesByPathToUpdate,
        branchName,
    })

    commentReply.reply(
        `I've put up [a pull request](${pullRequestURL}) to add @${who}! :tada:`,
    )
}

async function probotProcessIssueComment({ context, commentReply }) {
    const commentBody = context.payload.comment.body
    const { who, action, contributions } = parseComment(commentBody)
    const defaultBranch = context.payload.repository.default_branch
    const repository = new Repository({
        ...context.repo(),
        github: context.github,
        defaultBranch,
    })

    const optionsConfig = new OptionsConfig({
        repository,
        commentReply,
    })

    try {
        await optionsConfig.fetch()
    } catch (error) {
        if (error instanceof ResourceNotFoundError) {
            optionsConfig.init()
        } else {
            throw error
        }
    }

    if (action === 'add') {
        await processAddContributor({
            context,
            commentReply,
            repository,
            optionsConfig,
            who,
            contributions,
        })
        return
    }

    commentReply.reply(`I could not determine your intention.`)
    commentReply.reply(
        `Basic usage: @all-contributors please add @jakebolam for code, doc and infra`,
    )
    commentReply.reply(
        `For other usage see the [documentation](https://github.com/all-contributors/all-contributors-bot#usage)`,
    )
    return
}

async function probotProcessIssueCommentSafe({ context }) {
    const commentReply = new CommentReply({ context })
    try {
        await probotProcessIssueComment({ context, commentReply })
    } catch (error) {
        if (error.handled) {
            context.log.debug(error)
        } else if (error instanceof AllContributorBotError) {
            context.log.info(error)
            commentReply.reply(error.message)
        } else {
            context.log.error(error)
            commentReply.reply(
                `We had trouble processing your request. Please try again later.`,
            )
            throw error
        }
    } finally {
        await commentReply.send()
    }
}

function processIssueCommentApp(app) {
    // issueComment.edited
    // Issue comments and PR comments both create issue_comment events
    app.on('issue_comment.created', async context => {
        app.log.trace(context)
        await probotProcessIssueCommentSafe({ context })
    })
}

module.exports = processIssueCommentApp
