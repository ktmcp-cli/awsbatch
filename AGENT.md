# AGENT.md — AWS Batch CLI for AI Agents

This document explains how to use the AWS Batch CLI as an AI agent.

## Overview

The `awsbatch` CLI provides access to the AWS Batch Computing API. Requires AWS credentials with Batch permissions.

## Prerequisites

```bash
awsbatch config set accessKeyId YOUR_AWS_ACCESS_KEY_ID
awsbatch config set secretAccessKey YOUR_AWS_SECRET_ACCESS_KEY
awsbatch config set region us-east-1
```

## All Commands

### Config

```bash
awsbatch config get <key>
awsbatch config set <key> <value>
awsbatch config list
```

### Jobs

```bash
# Submit
awsbatch jobs submit --name my-job --queue my-queue --definition my-def
awsbatch jobs submit --name my-job --queue my-queue --definition my-def --parameters '{"key":"val"}'
awsbatch jobs submit --name my-job --queue my-queue --definition my-def --container-overrides '{"command":["cmd"]}'

# Status
awsbatch jobs get <job-id>

# List
awsbatch jobs list --queue my-queue
awsbatch jobs list --queue my-queue --status RUNNING
awsbatch jobs list --queue my-queue --status SUCCEEDED
awsbatch jobs list --queue my-queue --status FAILED

# Describe multiple
awsbatch jobs describe <job-id-1> <job-id-2>

# Terminate
awsbatch jobs terminate <job-id>
awsbatch jobs terminate <job-id> --reason "No longer needed"
```

### Queues

```bash
awsbatch queues list
awsbatch queues get <queue-name>
awsbatch queues create --name <name> --state ENABLED --priority 1
awsbatch queues update <queue-name> --state DISABLED
awsbatch queues update <queue-name> --priority 10
```

### Job Definitions

```bash
awsbatch definitions list
awsbatch definitions list --name <name>
awsbatch definitions list --status ACTIVE
awsbatch definitions describe <definition-name>
awsbatch definitions register --name <name> --type container --container '{"image":"img:tag","vcpus":1,"memory":512}'
```

## JSON Output

All commands support `--json`:

```bash
awsbatch jobs get <id> --json
awsbatch queues list --json
awsbatch definitions list --json
```

## Job Status Values

- SUBMITTED — Job submitted, awaiting scheduling
- PENDING — Job pending scheduling
- RUNNABLE — Job scheduled, waiting for resources
- STARTING — Job starting
- RUNNING — Job running
- SUCCEEDED — Job completed successfully
- FAILED — Job failed

## Error Handling

The CLI exits with code 1 on error and prints to stderr.
- `AWS authentication failed` — Check accessKeyId and secretAccessKey
- `Resource not found` — Check queue/definition names and job IDs
