import { promises as fs } from "fs"
import { parse } from "./lcov"
import { commentIdentifier, diff } from "./comment"
import * as core from '@actions/core'
import * as github from '@actions/github'

const context = github.context;

async function main() {
	console.log(JSON.stringify(context))
	const token = core.getInput("github-token")
	const name = core.getInput("name")
	const lcovFile = core.getInput("lcov-file") || "./coverage/lcov.info"
	const baseFile = core.getInput("lcov-base")
	const updateComment = core.getInput("update-comment")

	const raw = await fs.readFile(lcovFile, "utf-8").catch(err => null)
	if (!raw) {
		console.log(`No coverage report found at '${lcovFile}', exiting...`)
		return
	}

	const baseRaw =
		baseFile && (await fs.readFile(baseFile, "utf-8").catch(err => null))
	if (baseFile && !baseRaw) {
		console.log(`No coverage report found at '${baseFile}', ignoring...`)
	}

	const isPullRequest = Boolean(context.payload.pull_request)
	// if (!isPullRequest) {
	// 	console.log("Not a pull request, skipping...")
	// 	return
	// }

	const options = {
		name,
		repository: context.payload.repository.full_name,
		commitSHA: context.sha,
		commitMessage: context.payload.head_commit.message,
		prefix: `${process.env.GITHUB_WORKSPACE}/`,
		head: isPullRequest ? context.payload.pull_request.head.ref : "",
		base: isPullRequest ? context.payload.pull_request.base.ref : "",
		workflowName: process.env.GITHUB_WORKFLOW,
		isPullRequest: isPullRequest
	}

	const lcov = await parse(raw)
	const baselcov = baseRaw && (await parse(baseRaw))
	const body = await diff(lcov, baselcov, options)
	const githubClient = github.getOctokit(token).rest

	const createGitHubComment = () => {
		if (isPullRequest) {
			return githubClient.issues.createComment({
				repo: context.repo.repo,
				owner: context.repo.owner,
				body,
				issue_number: context.payload.pull_request.number,
			});
		} else {
			return githubClient.repos.createCommitComment({
				repo: context.repo.repo,
				owner: context.repo.owner,
				body,
				commit_sha: context.sha
			})
		}
	}

	const updateGitHubComment = commentId =>
		githubClient.issues.updateComment({
			repo: context.repo.repo,
			owner: context.repo.owner,
			comment_id: commentId,
			body,
		})

	if (updateComment) {
		let issueComments
		if (isPullRequest) {
			issueComments = await githubClient.issues.listComments({
				repo: context.repo.repo,
				owner: context.repo.owner,
				issue_number: context.payload.pull_request.number,
			});
		} else {
			issueComments = await githubClient.repos.listCommentsForCommit({
				repo: context.repo.repo,
				owner: context.repo.owner,
				number: context.issue.number,
			});
		}

		const existingComment = issueComments.data.find(comment =>
			comment.body.includes(commentIdentifier(options.workflowName)),
		);

		if (existingComment) {
			if (isPullRequest) await updateGitHubComment(existingComment.id);
			return
		}
	}

	await createGitHubComment()

	const output = {
		title: "Code Coverage Report",
		summary: body
	}

	console.log("GITHUB_STEP_SUMMARY", process.env["GITHUB_STEP_SUMMARY"])
	const pathSummary = process.env["GITHUB_STEP_SUMMARY"]
	fs.writeFileSync(pathSummary, body);

	await githubClient.checks.create({
		repo: context.repo.repo,
		owner: context.repo.owner,
		name: "Code Coverage Report",
		head_sha: context.sha,
		status: 'completed',
		conclusion: 'success',
		output
	})
}

export default main().catch(function (err) {
	console.log(err)
	core.setFailed(err.message)
})
