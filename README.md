> "Six months ago, everyone was talking about MCPs. And I was like, screw MCPs. Every MCP would be better as a CLI."
>
> — [Peter Steinberger](https://twitter.com/steipete), Founder of OpenClaw
> [Watch on YouTube (~2:39:00)](https://www.youtube.com/@lexfridman) | [Lex Fridman Podcast #491](https://lexfridman.com/peter-steinberger/)

# AWS Batch CLI

Production-ready CLI for the AWS Batch Computing API. Submit and manage batch jobs, queues, and job definitions from your terminal.

## Installation

```bash
npm install -g @ktmcp-cli/awsbatch
```

## Configuration

```bash
awsbatch config set accessKeyId YOUR_AWS_ACCESS_KEY_ID
awsbatch config set secretAccessKey YOUR_AWS_SECRET_ACCESS_KEY
awsbatch config set region us-east-1
```

## Usage

### Jobs

```bash
# Submit a job
awsbatch jobs submit --name my-job --queue my-queue --definition my-job-def
awsbatch jobs submit --name my-job --queue my-queue --definition my-job-def \
  --parameters '{"key":"value"}' \
  --container-overrides '{"command":["my-script.sh"]}'

# Get job status
awsbatch jobs get <job-id>

# List jobs in a queue
awsbatch jobs list --queue my-queue
awsbatch jobs list --queue my-queue --status RUNNING
awsbatch jobs list --queue my-queue --status SUCCEEDED --limit 20

# Describe multiple jobs
awsbatch jobs describe <job-id-1> <job-id-2>

# Terminate a job
awsbatch jobs terminate <job-id>
awsbatch jobs terminate <job-id> --reason "No longer needed"
```

### Queues

```bash
# List job queues
awsbatch queues list

# Get queue details
awsbatch queues get my-queue

# Create a queue
awsbatch queues create --name my-queue --priority 10
awsbatch queues create --name my-queue --state ENABLED --priority 5

# Update a queue
awsbatch queues update my-queue --state DISABLED
awsbatch queues update my-queue --priority 20
```

### Job Definitions

```bash
# List job definitions
awsbatch definitions list
awsbatch definitions list --name my-definition
awsbatch definitions list --status ACTIVE

# Describe a job definition
awsbatch definitions describe my-definition

# Register a job definition
awsbatch definitions register --name my-job-def --type container \
  --container '{"image":"my-image:latest","vcpus":1,"memory":512}'
```

### JSON Output

All commands support `--json`:

```bash
awsbatch jobs get <id> --json
awsbatch queues list --json
awsbatch definitions list --json | jq '.[].jobDefinitionName'
```

## License

MIT
