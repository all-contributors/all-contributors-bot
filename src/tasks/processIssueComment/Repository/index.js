const {
    BranchNotFoundError,
    ResourceNotFoundError,
    AllContributorBotError,
} = require('../utils/errors')

class Repository {
    constructor({ repo, owner, github, defaultBranch }) {
        this.github = github
        this.repo = repo
        this.owner = owner
        this.defaultBranch = defaultBranch
        this.baseBranch = defaultBranch
    }

    getFullname() {
        return `${this.owner}/${this.repo}`
    }

    setBaseBranch(branchName) {
        this.baseBranch = branchName
    }

    async getFile(filePath) {
        try {
            // https://octokit.github.io/rest.js/#api-Repos-getContents
            const file = await this.github.repos.getContents({
                owner: this.owner,
                repo: this.repo,
                path: filePath,
                ref: this.baseBranch,
            })
            // Contents can be an array if its a directory, should be an edge case, and we can just crash
            const contentBinary = file.data.content
            const content = Buffer.from(contentBinary, 'base64').toString()
            return {
                content,
                sha: file.data.sha,
            }
        } catch (error) {
            if (error.status === 404) {
                throw new ResourceNotFoundError(filePath, this.full_name)
            } else {
                throw error
            }
        }
    }

    async getMultipleFiles(filePathsArray) {
        // TODO: can probably optimise this instead of sending a request per file
        const repository = this

        const getFilesMultiple = filePathsArray.map(filePath => {
            return repository.getFile(filePath).then(({ content, sha }) => ({
                filePath,
                content,
                sha,
            }))
        })

        const getFilesMultipleList = await Promise.all(getFilesMultiple)
        const multipleFilesByPath = {}
        getFilesMultipleList.forEach(({ filePath, content, sha }) => {
            multipleFilesByPath[filePath] = {
                content,
                sha,
            }
        })

        return multipleFilesByPath
    }

    async getRef(branchName) {
        try {
            const result = await this.github.git.getRef({
                owner: this.owner,
                repo: this.repo,
                ref: `heads/${branchName}`,
            })
            return result.data.object.sha
        } catch (error) {
            if (error.status === 404) {
                throw new BranchNotFoundError(branchName)
            }
        }
    }

    async createBranch(branchName) {
        const fromSha = await this.getRef(this.defaultBranch)

        // https://octokit.github.io/rest.js/#api-Git-createRef
        await this.github.git.createRef({
            owner: this.owner,
            repo: this.repo,
            ref: `refs/heads/${branchName}`,
            sha: fromSha,
        })
    }

    async updateFile({ filePath, content, branchName, originalSha }) {
        const contentBinary = Buffer.from(content).toString('base64')

        //octokit.github.io/rest.js/#api-Repos-updateFile
        await this.github.repos.updateFile({
            owner: this.owner,
            repo: this.repo,
            path: filePath,
            message: `docs: update ${filePath}`,
            content: contentBinary,
            sha: originalSha,
            branch: branchName,
        })
    }

    async createFile({ filePath, content, branchName }) {
        const contentBinary = Buffer.from(content).toString('base64')

        //octokit.github.io/rest.js/#api-Repos-createFile
        await this.github.repos.createFile({
            owner: this.owner,
            repo: this.repo,
            path: filePath,
            message: `docs: create ${filePath}`,
            content: contentBinary,
            branch: branchName,
        })
    }

    async createOrUpdateFile({ filePath, content, branchName, originalSha }) {
        if (originalSha === undefined) {
            await this.createFile({ filePath, content, branchName })
        } else {
            await this.updateFile({
                filePath,
                content,
                branchName,
                originalSha,
            })
        }
    }

    async createOrUpdateFiles({ filesByPath, branchName }) {
        const repository = this
        const createOrUpdateFilesMultiple = Object.entries(filesByPath).map(
            ([filePath, { content, originalSha }]) => {
                return repository.createOrUpdateFile({
                    filePath,
                    content,
                    branchName,
                    originalSha,
                })
            },
        )

        await Promise.all(createOrUpdateFilesMultiple)
    }

    async createPullRequest({ title, body, branchName }) {
        try {
            const result = await this.github.pulls.create({
                owner: this.owner,
                repo: this.repo,
                title,
                body,
                head: branchName,
                base: this.defaultBranch,
                maintainer_can_modify: true,
            })
            return result.data.html_url
        } catch (error) {
            if (error.status === 422)
                // TODO: link to pull request
                throw new AllContributorBotError('Pull request is already open')

            throw error
        }
    }

    async createPullRequestFromFiles({ title, body, filesByPath, branchName }) {
        const branchNameExists = branchName === this.baseBranch
        if (!branchNameExists) {
            await this.createBranch(branchName)
        }

        await this.createOrUpdateFiles({
            filesByPath,
            branchName,
        })

        const pullRequestURL = await this.createPullRequest({
            title,
            body,
            branchName,
        })
        return pullRequestURL
    }
}

module.exports = Repository
