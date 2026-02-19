import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getConfig, setConfig, getAllConfig, isConfigured } from './config.js';
import {
  submitJob,
  describeJobs,
  listJobs,
  terminateJob,
  listQueues,
  getQueue,
  createQueue,
  updateQueue,
  listDefinitions,
  describeDefinitions,
  registerDefinition
} from './api.js';

const program = new Command();

// ============================================================
// Helpers
// ============================================================

function printSuccess(message) {
  console.log(chalk.green('✓') + ' ' + message);
}

function printError(message) {
  console.error(chalk.red('✗') + ' ' + message);
}

function printTable(data, columns) {
  if (!data || data.length === 0) {
    console.log(chalk.yellow('No results found.'));
    return;
  }

  const widths = {};
  columns.forEach(col => {
    widths[col.key] = col.label.length;
    data.forEach(row => {
      const val = String(col.format ? col.format(row[col.key], row) : (row[col.key] ?? ''));
      if (val.length > widths[col.key]) widths[col.key] = val.length;
    });
    widths[col.key] = Math.min(widths[col.key], 40);
  });

  const header = columns.map(col => col.label.padEnd(widths[col.key])).join('  ');
  console.log(chalk.bold(chalk.cyan(header)));
  console.log(chalk.dim('─'.repeat(header.length)));

  data.forEach(row => {
    const line = columns.map(col => {
      const val = String(col.format ? col.format(row[col.key], row) : (row[col.key] ?? ''));
      return val.substring(0, widths[col.key]).padEnd(widths[col.key]);
    }).join('  ');
    console.log(line);
  });

  console.log(chalk.dim(`\n${data.length} result(s)`));
}

function printJson(data) {
  console.log(JSON.stringify(data, null, 2));
}

async function withSpinner(message, fn) {
  const spinner = ora(message).start();
  try {
    const result = await fn();
    spinner.stop();
    return result;
  } catch (error) {
    spinner.stop();
    throw error;
  }
}

function requireAuth() {
  if (!isConfigured()) {
    printError('AWS credentials not configured.');
    console.log('\nRun the following to configure:');
    console.log(chalk.cyan('  awsbatch config set accessKeyId YOUR_KEY'));
    console.log(chalk.cyan('  awsbatch config set secretAccessKey YOUR_SECRET'));
    console.log(chalk.cyan('  awsbatch config set region us-east-1'));
    process.exit(1);
  }
}

// ============================================================
// Program metadata
// ============================================================

program
  .name('awsbatch')
  .description(chalk.bold('AWS Batch CLI') + ' - Manage batch computing jobs from your terminal')
  .version('1.0.0');

// ============================================================
// CONFIG
// ============================================================

const configCmd = program.command('config').description('Manage CLI configuration');

configCmd
  .command('get <key>')
  .description('Get a configuration value')
  .action((key) => {
    const value = getConfig(key);
    if (value === undefined) {
      printError(`Key '${key}' not found`);
    } else {
      console.log(value);
    }
  });

configCmd
  .command('set <key> <value>')
  .description('Set a configuration value')
  .action((key, value) => {
    setConfig(key, value);
    printSuccess(`Config '${key}' set`);
  });

configCmd
  .command('list')
  .description('List all configuration values')
  .action(() => {
    const all = getAllConfig();
    console.log(chalk.bold('\nAWS Batch CLI Configuration\n'));
    if (Object.keys(all).length === 0) {
      console.log(chalk.yellow('No configuration set.'));
      console.log('\nRun:');
      console.log(chalk.cyan('  awsbatch config set accessKeyId YOUR_KEY'));
      console.log(chalk.cyan('  awsbatch config set secretAccessKey YOUR_SECRET'));
      console.log(chalk.cyan('  awsbatch config set region us-east-1'));
    } else {
      Object.entries(all).forEach(([k, v]) => {
        const displayVal = k === 'secretAccessKey' ? chalk.green('*'.repeat(8)) : chalk.cyan(String(v));
        console.log(`${k}: ${displayVal}`);
      });
    }
  });

// ============================================================
// JOBS
// ============================================================

const jobsCmd = program.command('jobs').description('Manage AWS Batch jobs');

jobsCmd
  .command('submit')
  .description('Submit a new batch job')
  .requiredOption('--name <name>', 'Job name')
  .requiredOption('--queue <queue>', 'Job queue name or ARN')
  .requiredOption('--definition <def>', 'Job definition name or ARN')
  .option('--parameters <json>', 'Job parameters as JSON')
  .option('--container-overrides <json>', 'Container overrides as JSON')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    requireAuth();

    let parameters, containerOverrides;
    if (options.parameters) {
      try { parameters = JSON.parse(options.parameters); } catch { printError('Invalid JSON for --parameters'); process.exit(1); }
    }
    if (options.containerOverrides) {
      try { containerOverrides = JSON.parse(options.containerOverrides); } catch { printError('Invalid JSON for --container-overrides'); process.exit(1); }
    }

    try {
      const result = await withSpinner('Submitting job...', () =>
        submitJob({
          jobName: options.name,
          jobQueue: options.queue,
          jobDefinition: options.definition,
          parameters,
          containerOverrides
        })
      );

      if (options.json) {
        printJson(result);
        return;
      }

      printSuccess('Job submitted');
      console.log('Job ID:    ', chalk.cyan(result?.jobId || 'N/A'));
      console.log('Job Name:  ', result?.jobName || options.name);
      console.log('Job ARN:   ', result?.jobArn || 'N/A');
    } catch (error) {
      printError(error.message);
      process.exit(1);
    }
  });

jobsCmd
  .command('get <job-id>')
  .description('Get job details')
  .option('--json', 'Output as JSON')
  .action(async (jobId, options) => {
    requireAuth();
    try {
      const jobs = await withSpinner(`Fetching job ${jobId}...`, () => describeJobs([jobId]));
      const job = jobs[0];

      if (!job) {
        printError('Job not found');
        process.exit(1);
      }

      if (options.json) {
        printJson(job);
        return;
      }

      const statusColor = job.status === 'SUCCEEDED' ? chalk.green : job.status === 'FAILED' ? chalk.red : chalk.yellow;

      console.log(chalk.bold('\nJob Details\n'));
      console.log('Job ID:          ', chalk.cyan(job.jobId));
      console.log('Job Name:        ', chalk.bold(job.jobName));
      console.log('Status:          ', statusColor(job.status || 'N/A'));
      console.log('Queue:           ', job.jobQueue || 'N/A');
      console.log('Definition:      ', job.jobDefinition || 'N/A');
      console.log('Created:         ', job.createdAt ? new Date(job.createdAt).toLocaleString() : 'N/A');
      console.log('Started:         ', job.startedAt ? new Date(job.startedAt).toLocaleString() : 'N/A');
      console.log('Stopped:         ', job.stoppedAt ? new Date(job.stoppedAt).toLocaleString() : 'N/A');
      if (job.statusReason) console.log('Status Reason:   ', chalk.dim(job.statusReason));
      if (job.container?.exitCode !== undefined) console.log('Exit Code:       ', job.container.exitCode);
      console.log('');
    } catch (error) {
      printError(error.message);
      process.exit(1);
    }
  });

jobsCmd
  .command('list')
  .description('List jobs in a queue')
  .requiredOption('--queue <queue>', 'Job queue name')
  .option('--status <status>', 'Filter by status (SUBMITTED|PENDING|RUNNABLE|STARTING|RUNNING|SUCCEEDED|FAILED)')
  .option('--limit <n>', 'Maximum number of results', '50')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    requireAuth();
    try {
      const jobs = await withSpinner('Fetching jobs...', () =>
        listJobs({
          jobQueue: options.queue,
          jobStatus: options.status,
          maxResults: parseInt(options.limit)
        })
      );

      if (options.json) {
        printJson(jobs);
        return;
      }

      printTable(jobs, [
        { key: 'jobId', label: 'Job ID', format: (v) => v ? String(v).substring(0, 16) + '...' : '' },
        { key: 'jobName', label: 'Name' },
        { key: 'status', label: 'Status' },
        { key: 'createdAt', label: 'Created', format: (v) => v ? new Date(v).toLocaleDateString() : '' }
      ]);
    } catch (error) {
      printError(error.message);
      process.exit(1);
    }
  });

jobsCmd
  .command('terminate <job-id>')
  .description('Terminate a job')
  .option('--reason <reason>', 'Termination reason', 'Terminated via CLI')
  .action(async (jobId, options) => {
    requireAuth();
    try {
      await withSpinner(`Terminating job ${jobId}...`, () =>
        terminateJob(jobId, options.reason)
      );
      printSuccess(`Job ${jobId} terminated`);
    } catch (error) {
      printError(error.message);
      process.exit(1);
    }
  });

jobsCmd
  .command('describe <job-ids...>')
  .description('Describe one or more jobs by ID')
  .option('--json', 'Output as JSON')
  .action(async (jobIds, options) => {
    requireAuth();
    try {
      const jobs = await withSpinner('Fetching job details...', () => describeJobs(jobIds));

      if (options.json) {
        printJson(jobs);
        return;
      }

      printTable(jobs, [
        { key: 'jobId', label: 'Job ID', format: (v) => v ? String(v).substring(0, 16) + '...' : '' },
        { key: 'jobName', label: 'Name' },
        { key: 'status', label: 'Status' },
        { key: 'jobQueue', label: 'Queue', format: (v) => (v || '').split('/').pop() },
        { key: 'createdAt', label: 'Created', format: (v) => v ? new Date(v).toLocaleDateString() : '' }
      ]);
    } catch (error) {
      printError(error.message);
      process.exit(1);
    }
  });

// ============================================================
// QUEUES
// ============================================================

const queuesCmd = program.command('queues').description('Manage AWS Batch job queues');

queuesCmd
  .command('list')
  .description('List job queues')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    requireAuth();
    try {
      const queues = await withSpinner('Fetching job queues...', () => listQueues());

      if (options.json) {
        printJson(queues);
        return;
      }

      printTable(queues, [
        { key: 'jobQueueName', label: 'Name' },
        { key: 'state', label: 'State' },
        { key: 'status', label: 'Status' },
        { key: 'priority', label: 'Priority', format: (v) => String(v || 0) }
      ]);
    } catch (error) {
      printError(error.message);
      process.exit(1);
    }
  });

queuesCmd
  .command('get <queue-name>')
  .description('Get job queue details')
  .option('--json', 'Output as JSON')
  .action(async (queueName, options) => {
    requireAuth();
    try {
      const queue = await withSpinner(`Fetching queue ${queueName}...`, () => getQueue(queueName));

      if (!queue) {
        printError('Queue not found');
        process.exit(1);
      }

      if (options.json) {
        printJson(queue);
        return;
      }

      console.log(chalk.bold('\nJob Queue Details\n'));
      console.log('Name:          ', chalk.cyan(queue.jobQueueName));
      console.log('ARN:           ', queue.jobQueueArn || 'N/A');
      console.log('State:         ', queue.state || 'N/A');
      console.log('Status:        ', queue.status || 'N/A');
      console.log('Priority:      ', queue.priority !== undefined ? String(queue.priority) : 'N/A');
      if (queue.statusReason) console.log('Status Reason: ', queue.statusReason);
      console.log('');
    } catch (error) {
      printError(error.message);
      process.exit(1);
    }
  });

queuesCmd
  .command('create')
  .description('Create a new job queue')
  .requiredOption('--name <name>', 'Queue name')
  .option('--state <state>', 'Queue state (ENABLED|DISABLED)', 'ENABLED')
  .option('--priority <n>', 'Queue priority (1-1000)', '1')
  .option('--compute-envs <json>', 'Compute environment order as JSON array')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    requireAuth();

    let computeEnvironmentOrder = [];
    if (options.computeEnvs) {
      try { computeEnvironmentOrder = JSON.parse(options.computeEnvs); } catch { printError('Invalid JSON for --compute-envs'); process.exit(1); }
    }

    try {
      const result = await withSpinner('Creating job queue...', () =>
        createQueue({
          queueName: options.name,
          state: options.state,
          priority: parseInt(options.priority),
          computeEnvironmentOrder
        })
      );

      if (options.json) {
        printJson(result);
        return;
      }

      printSuccess(`Queue '${options.name}' created`);
      if (result) {
        console.log('Queue ARN: ', result.jobQueueArn || 'N/A');
      }
    } catch (error) {
      printError(error.message);
      process.exit(1);
    }
  });

queuesCmd
  .command('update <queue-name>')
  .description('Update a job queue')
  .option('--state <state>', 'Queue state (ENABLED|DISABLED)')
  .option('--priority <n>', 'Queue priority')
  .option('--json', 'Output as JSON')
  .action(async (queueName, options) => {
    requireAuth();
    try {
      const result = await withSpinner(`Updating queue ${queueName}...`, () =>
        updateQueue({
          queueName,
          state: options.state,
          priority: options.priority ? parseInt(options.priority) : undefined
        })
      );

      if (options.json) {
        printJson(result);
        return;
      }

      printSuccess(`Queue '${queueName}' updated`);
    } catch (error) {
      printError(error.message);
      process.exit(1);
    }
  });

// ============================================================
// DEFINITIONS
// ============================================================

const definitionsCmd = program.command('definitions').description('Manage AWS Batch job definitions');

definitionsCmd
  .command('list')
  .description('List job definitions')
  .option('--name <name>', 'Filter by definition name')
  .option('--status <status>', 'Filter by status (ACTIVE|INACTIVE)', 'ACTIVE')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    requireAuth();
    try {
      const definitions = await withSpinner('Fetching job definitions...', () =>
        listDefinitions({ definitionName: options.name, status: options.status })
      );

      if (options.json) {
        printJson(definitions);
        return;
      }

      printTable(definitions, [
        { key: 'jobDefinitionName', label: 'Name' },
        { key: 'revision', label: 'Rev', format: (v) => String(v || '') },
        { key: 'type', label: 'Type' },
        { key: 'status', label: 'Status' }
      ]);
    } catch (error) {
      printError(error.message);
      process.exit(1);
    }
  });

definitionsCmd
  .command('register')
  .description('Register a new job definition')
  .requiredOption('--name <name>', 'Job definition name')
  .option('--type <type>', 'Job type (container|multinode)', 'container')
  .option('--container <json>', 'Container properties as JSON')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    requireAuth();

    let containerProperties;
    if (options.container) {
      try { containerProperties = JSON.parse(options.container); } catch { printError('Invalid JSON for --container'); process.exit(1); }
    }

    try {
      const result = await withSpinner('Registering job definition...', () =>
        registerDefinition({
          definitionName: options.name,
          type: options.type,
          containerProperties
        })
      );

      if (options.json) {
        printJson(result);
        return;
      }

      printSuccess(`Job definition '${options.name}' registered`);
      if (result) {
        console.log('ARN:      ', result.jobDefinitionArn || 'N/A');
        console.log('Revision: ', result.revision !== undefined ? String(result.revision) : 'N/A');
      }
    } catch (error) {
      printError(error.message);
      process.exit(1);
    }
  });

definitionsCmd
  .command('describe <definition-name>')
  .description('Describe a job definition')
  .option('--json', 'Output as JSON')
  .action(async (definitionName, options) => {
    requireAuth();
    try {
      const definitions = await withSpinner(`Fetching definition ${definitionName}...`, () =>
        describeDefinitions([definitionName])
      );

      if (options.json) {
        printJson(definitions);
        return;
      }

      if (!definitions || definitions.length === 0) {
        printError('Job definition not found');
        process.exit(1);
      }

      const def = definitions[0];
      console.log(chalk.bold('\nJob Definition Details\n'));
      console.log('Name:      ', chalk.cyan(def.jobDefinitionName));
      console.log('ARN:       ', def.jobDefinitionArn || 'N/A');
      console.log('Revision:  ', def.revision !== undefined ? String(def.revision) : 'N/A');
      console.log('Type:      ', def.type || 'N/A');
      console.log('Status:    ', def.status || 'N/A');
      if (def.containerProperties) {
        console.log('Image:     ', def.containerProperties.image || 'N/A');
        console.log('vCPUs:     ', def.containerProperties.vcpus || 'N/A');
        console.log('Memory:    ', def.containerProperties.memory ? `${def.containerProperties.memory} MB` : 'N/A');
      }
      console.log('');
    } catch (error) {
      printError(error.message);
      process.exit(1);
    }
  });

// ============================================================
// Parse
// ============================================================

program.parse(process.argv);

if (process.argv.length <= 2) {
  program.help();
}
