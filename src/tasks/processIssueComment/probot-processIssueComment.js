const Analytics = require('../../utils/Analytics')
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

async function processAddContributors({
    context,
    commentReply,
    repository,
    optionsConfig,
    contributors,
    branchName,
}) {

    const usersAdded = []
    const usersMissed = []

    async function addContributor(who, contributions) {
        if (contributions.length === 0) {
            context.log.debug(`No contributions for ${who}`)
            usersMissed.push(who)
            return
        }

        // TODO: wrap this blog in a try catch, if one user fails, don't fail the whole pull request
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

        usersAdded.push(who)
    }

    // TODO: throttle max paralle requests
    const addContributorPromises = contributors.map(function(contributor) {
        return addContributor((contributor.who, contributor.contributions))
    })

    await Promise.all(addContributorPromises)

    if (usersAdded === 0) {
        return commentReply.reply(
        `I couldn't determine any contributions for ${usersAdded.join(', ')}.
        Did you specify any contributions? Please make sure to use [valid contribution names](https://allcontributors.org/docs/en/emoji-key).`,
    )

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

    const pullRequestBodyAdds = `Adds the following contributors:
- ${usersAdded.join('\n- ')}\n\n`

    const pullRequestBodyMissed = `Unable to determine contributions for the following contributors, these were excluded from this PR:
- ${usersMissed.join('\\n- ')}\n\n`

    const pullRequestBodyRequester = `This was requested by ${commentReply.replyingToWho()} [in this comment](${commentReply.replyingToWhere()})`

    const {
        pullRequestURL,
        pullCreated,
    } = await repository.createPullRequestFromFiles({
        title: `docs: add new contributors`,
        body: `${pullRequestBodyAdds}.\n\n
${usersMissed > 0 ? pullRequestBodyMissed : ''}
${pullRequestBodyRequester}
`,
        filesByPath: filesByPathToUpdate,
        branchName,
    })

    if (pullCreated) {
        commentReply.reply(
            `I've put up [a pull request](${pullRequestURL}) to add new contributors! :tada:`,
        )
        return
    }
    // Updated
    commentReply.reply(
        `I've updated [the pull request](${pullRequestURL}) to add contributors! :tada:`,
    )
}

async function setupRepository({ context, branchName }) {
    const defaultBranch = context.payload.repository.default_branch
    const repository = new Repository({
        ...context.repo(),
        github: context.github,
        defaultBranch,
        log: context.log,
    })

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

    return repository
}

async function setupOptionsConfig({ repository }) {
    const optionsConfig = new OptionsConfig({
        repository,
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

    return optionsConfig
}

async function probotProcessIssueComment({ context, commentReply, analytics }) {
    const commentBody = context.payload.comment.body
    analytics.track('processComment', {
        commentBody: commentBody,
    })
    const { action, contributors } = parseComment(commentBody)

    if (action === 'add') {
        analytics.track('addContributors', {
            who: commentBody,
            contributors,
        })

        const whos = contributors.map(({ who }) => who).join('--')
        const safeWho = getSafeRef(whos)
        // TODO: max length on branch name?
        // TODO: should this be the branch name
        const branchName = `all-contributors/add-${safeWho}`

        const repository = await setupRepository({
            context,
            branchName,
        })
        const optionsConfig = await setupOptionsConfig({ repository })

        await processAddContributors({
            context,
            commentReply,
            repository,
            optionsConfig,
            contributors,
            branchName,
        })
        analytics.track('processCommentSuccess')
        return
    }

    analytics.track('unknownIntent', {
        action,
    })

    commentReply.reply(`I could not determine your intention.`)
    commentReply.reply(
        `Basic usage: @all-contributors please add @jakebolam for code, doc and infra`,
    )
    commentReply.reply(
        `For other usages see the [documentation](https://allcontributors.org/docs/en/bot/usage)`,
    )
    return
}

async function probotProcessIssueCommentSafe({ context }) {
    const analytics = new Analytics({
        ...context.repo(),
        user: context.payload.sender.login,
        log: context.log,
    })
    const commentReply = new CommentReply({ context })
    try {
        await probotProcessIssueComment({ context, commentReply, analytics })
    } catch (error) {
        if (error instanceof AllContributorBotError) {
            context.log.info(error)
            commentReply.reply(error.message)
            analytics.track('errorKnown', {
                errorMessage: error.message,
            })
        } else {
            context.log.error(error)
            commentReply.reply(
                `We had trouble processing your request. Please try again later.`,
            )
            analytics.track('errorUnKnown', {
                errorMessage: error.message,
            })
            throw error
        }
    } finally {
        await commentReply.send()
        await analytics.finishQueue()
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
