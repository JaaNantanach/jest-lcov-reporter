'use strict';

var require$$0 = require('node:fs');
var require$$1 = require('node:path');

var lib = {exports: {}};

/*
Copyright (c) 2012, Yahoo! Inc. All rights reserved.
Code licensed under the BSD License:
http://yuilibrary.com/license/
*/

var fs = require$$0,
    path = require$$1;

/* istanbul ignore next */
var exists = fs.exists || path.exists;

var walkFile = function(str, cb) {
    var data = [], item;

    [ 'end_of_record' ].concat(str.split('\n')).forEach(function(line) {
        line = line.trim();
        var allparts = line.split(':'),
            parts = [allparts.shift(), allparts.join(':')],
            lines, fn;

        switch (parts[0].toUpperCase()) {
            case 'TN':
                item.title = parts[1].trim();
                break;
            case 'SF':
                item.file = parts.slice(1).join(':').trim();
                break;
            case 'FNF':
                item.functions.found = Number(parts[1].trim());
                break;
            case 'FNH':
                item.functions.hit = Number(parts[1].trim());
                break;
            case 'LF':
                item.lines.found = Number(parts[1].trim());
                break;
            case 'LH':
                item.lines.hit = Number(parts[1].trim());
                break;
            case 'DA':
                lines = parts[1].split(',');
                item.lines.details.push({
                    line: Number(lines[0]),
                    hit: Number(lines[1])
                });
                break;
            case 'FN':
                fn = parts[1].split(',');
                item.functions.details.push({
                    name: fn[1],
                    line: Number(fn[0])
                });
                break;
            case 'FNDA':
                fn = parts[1].split(',');
                item.functions.details.some(function(i, k) {
                    if (i.name === fn[1] && i.hit === undefined) {
                        item.functions.details[k].hit = Number(fn[0]);
                        return true;
                    }
                });
                break;
            case 'BRDA':
                fn = parts[1].split(',');
                item.branches.details.push({
                    line: Number(fn[0]),
                    block: Number(fn[1]),
                    branch: Number(fn[2]),
                    taken: ((fn[3] === '-') ? 0 : Number(fn[3]))
                });
                break;
            case 'BRF':
                item.branches.found = Number(parts[1]);
                break;
            case 'BRH':
                item.branches.hit = Number(parts[1]);
                break;
        }

        if (line.indexOf('end_of_record') > -1) {
            data.push(item);
            item = {
              lines: {
                  found: 0,
                  hit: 0,
                  details: []
              },
              functions: {
                  hit: 0,
                  found: 0,
                  details: []
              },
              branches: {
                hit: 0,
                found: 0,
                details: []
              }
            };
        }
    });

    data.shift();

    if (data.length) {
        cb(null, data);
    } else {
        cb('Failed to parse string');
    }
};

var parse$1 = function(file, cb) {
    exists(file, function(x) {
        if (!x) {
            return walkFile(file, cb);
        }
        fs.readFile(file, 'utf8', function(err, str) {
            walkFile(str, cb);
        });
    });

};


lib.exports = parse$1;
lib.exports.source = walkFile;

// Parse lcov string into lcov data
function parse(data) {
	return new Promise(function(resolve, reject) {
		lib.exports(data, function(err, res) {
			if (err) {
				reject(err);
				return
			}
			resolve(res);
		});
	})
}

// Get the total coverage percentage from the lcov data.
function percentage$1(lcov) {
	let hit = 0;
	let found = 0;
	for (const entry of lcov) {
		hit += entry.lines.hit;
		found += entry.lines.found;
	}

	return (hit / found) * 100
}

function tag(name) {
	return function(...children) {
		const props =
			typeof children[0] === "object"
				? Object.keys(children[0])
						.map(key => ` ${key}='${children[0][key]}'`)
						.join("")
				: "";

		const c = typeof children[0] === "string" ? children : children.slice(1);

		return `<${name}${props}>${c.join("")}</${name}>`
	}
}

const h2 = tag("h2");
const details = tag("details");
const summary = tag("summary");
const tr = tag("tr");
const td = tag("td");
const th = tag("th");
const b = tag("b");
const table = tag("table");
const tbody = tag("tbody");
const span = tag("span");
const p = tag("p");

const fragment = function(...children) {
	return children.join("")
};

// Tabulate the lcov data in a HTML table.
function tabulate(lcov, options) {
	const head = tr(
		th("File"),
		th("Branches"),
		th("Funcs"),
		th("Lines"),
		th("Uncovered Lines"),
	);

	const folders = {};
	for (const file of lcov) {
		const parts = file.file.replace(options.prefix, "").split("/");
		const folder = parts.slice(0, -1).join("/");
		folders[folder] = folders[folder] || [];
		folders[folder].push(file);
	}

	const rows = Object.keys(folders)
		.sort()
		.reduce(
			(acc, key) => [
				...acc,
				toFolder(key),
				...folders[key].map(file => toRow(file, key !== "", options)),
			],
			[],
		);

	return table(tbody(head, ...rows))
}

function toFolder(path) {
	if (path === "") {
		return ""
	}

	return tr(td({ colspan: 5 }, b(path)))
}

function toRow(file, indent, options) {
	return tr(
		td(filename(file, indent, options)),
		td(percentage(file.branches)),
		td(percentage(file.functions)),
		td(percentage(file.lines)),
		td(uncovered(file, options)),
	)
}

function filename(file, indent, options) {
	const relative = file.file.replace(options.prefix, "");
	const parts = relative.split("/");
	const last = parts[parts.length - 1];
	const space = indent ? "&nbsp; &nbsp;" : "";
	return fragment(space, span(last))
}

function percentage(item) {
	if (!item) {
		return "N/A"
	}

	const value = item.found === 0 ? 100 : (item.hit / item.found) * 100;
	const rounded = value.toFixed(2).replace(/\.0*$/, "");

	const tag = value === 100 ? fragment : b;

	return tag(`${rounded}%`)
}

function uncovered(file, options) {
	const branches = (file.branches ? file.branches.details : [])
		.filter(branch => branch.taken === 0)
		.map(branch => branch.line);

	const lines = (file.lines ? file.lines.details : [])
		.filter(line => line.hit === 0)
		.map(line => line.line);
	[...branches, ...lines];
	let tempAll = ["..."];
	let all = [...branches, ...lines].sort();
	if (all.length > 4) {
		const lastFour = all.slice(Math.max(all.length - 4, 0));

		all = tempAll.concat(lastFour);
	}
	return all
		.map(function(line) {
			file.file.replace(options.prefix, "");
			const path = `${line}`;
			return span(path)
		})
		.join(", ")
}

function heading(name) {
	if (name) {
		return h2(`Code Coverage Report: ${name}`)
	} else {
		return h2(`Code Coverage Report`)
	}
}

function comment(lcov, table, options) {
	return fragment(
		heading(options.name),
		p(`Coverage after merging ${b(options.head)} into ${b(options.base)}`),
		table,
		"\n\n",
		details(summary("Coverage Report"), tabulate(lcov, options)),
		commentIdentifier(options.workflowName),
	)
}

function commentIdentifier(workflowName) {
	return `<!-- Code Coverage Comment: ${workflowName} -->`
}

function diff(lcov, before, options) {
	if (!before) {
		return comment(
			lcov,
			table(tbody(tr(th(percentage$1(lcov).toFixed(2), "%")))),
			options,
		)
	}

	const pbefore = percentage$1(before);
	const pafter = percentage$1(lcov);
	const pdiff = pafter - pbefore;
	const plus = pdiff > 0 ? "+" : "";
	const arrow = pdiff === 0 ? "" : pdiff < 0 ? "▾" : "▴";

	return comment(
		lcov,
		table(
			tbody(
				tr(
					th(pafter.toFixed(2), "%"),
					th(arrow, " ", plus, pdiff.toFixed(2), "%"),
				),
			),
		),
		options,
	)
}

const github = require('@actions/github');
const core = require('@actions/core');
const context = github.context;

async function main() {
	const token = core.getInput("github-token");
	const name = core.getInput("name");
	const lcovFile = core.getInput("lcov-file") || "./coverage/lcov.info";
	const baseFile = core.getInput("lcov-base");
	const updateComment = core.getInput("update-comment");

	const raw = await require$$0.promises.readFile(lcovFile, "utf-8").catch(err => null);
	if (!raw) {
		console.log(`No coverage report found at '${lcovFile}', exiting...`);
		return
	}

	const baseRaw =
		baseFile && (await require$$0.promises.readFile(baseFile, "utf-8").catch(err => null));
	if (baseFile && !baseRaw) {
		console.log(`No coverage report found at '${baseFile}', ignoring...`);
	}

	const isPullRequest = Boolean(context.payload.pull_request);
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
	};

	const lcov = await parse(raw);
	const baselcov = baseRaw && (await parse(baseRaw));
	const body = await diff(lcov, baselcov, options);
	const githubClient = github.getOctokit(token);

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
	};

	const updateGitHubComment = commentId =>
		githubClient.issues.updateComment({
			repo: context.repo.repo,
			owner: context.repo.owner,
			comment_id: commentId,
			body,
		});

	if (updateComment) {
		let issueComments;
		if (isPullRequest) {
			issueComments = await githubClient.issues.listComments({
				repo: context.repo.repo,
				owner: context.repo.owner,
				issue_number: context.payload.pull_request.number,
			});
		} else {
			issueComments = await githubClient.repos.listCommitComments({
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

	await createGitHubComment();

	const output = {
		title: "Code Coverage Report",
		summary: body
	};

	console.log("GITHUB_STEP_SUMMARY", process.env["GITHUB_STEP_SUMMARY"]);
	const pathSummary = process.env["GITHUB_STEP_SUMMARY"];
	require$$0.promises.writeFileSync(pathSummary, body);

	await githubClient.checks.create({
		repo: context.repo.repo,
		owner: context.repo.owner,
		name: "Code Coverage Report",
		head_sha: context.sha,
		status: 'completed',
		conclusion: 'success',
		output
	});
}

var index = main().catch(function (err) {
	console.log(err);
	core.setFailed(err.message);
});

module.exports = index;
