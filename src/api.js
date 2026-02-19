import axios from 'axios';
import crypto from 'crypto';
import { getConfig } from './config.js';

/**
 * AWS Signature Version 4 signing helper
 */
function sign(key, msg) {
  return crypto.createHmac('sha256', key).update(msg).digest();
}

function getSigningKey(secretKey, dateStamp, regionName, serviceName) {
  const kDate = sign('AWS4' + secretKey, dateStamp);
  const kRegion = sign(kDate, regionName);
  const kService = sign(kRegion, serviceName);
  return sign(kService, 'aws4_request');
}

function buildAuthHeader({ method, url, body, service, region, accessKeyId, secretAccessKey }) {
  const parsedUrl = new URL(url);
  const host = parsedUrl.host;
  const path = parsedUrl.pathname;
  const queryString = parsedUrl.search ? parsedUrl.search.slice(1) : '';

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = crypto.createHash('sha256').update(body || '').digest('hex');

  const canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-date';

  const canonicalRequest = [
    method.toUpperCase(),
    path,
    queryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex')
  ].join('\n');

  const signingKey = getSigningKey(secretAccessKey, dateStamp, region, service);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { authorization, amzDate };
}

function getBatchClient() {
  const accessKeyId = getConfig('accessKeyId');
  const secretAccessKey = getConfig('secretAccessKey');
  const region = getConfig('region') || 'us-east-1';
  const baseURL = `https://batch.${region}.amazonaws.com`;

  return {
    request: async (method, path, data = null) => {
      const url = `${baseURL}${path}`;
      const body = data ? JSON.stringify(data) : '';
      const { authorization, amzDate } = buildAuthHeader({
        method,
        url,
        body,
        service: 'batch',
        region,
        accessKeyId,
        secretAccessKey
      });

      try {
        const response = await axios({
          method,
          url,
          data: data || undefined,
          headers: {
            'Authorization': authorization,
            'X-Amz-Date': amzDate,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        });
        return response.data;
      } catch (error) {
        handleApiError(error);
      }
    }
  };
}

function handleApiError(error) {
  if (error.response) {
    const status = error.response.status;
    const data = error.response.data;
    if (status === 401 || status === 403) {
      throw new Error('AWS authentication failed. Check your accessKeyId and secretAccessKey.');
    } else if (status === 404) {
      throw new Error('Resource not found.');
    } else if (status === 429) {
      throw new Error('Rate limit exceeded. Please wait before retrying.');
    } else {
      const message = data?.message || data?.Message || data?.error || JSON.stringify(data);
      throw new Error(`AWS Batch Error (${status}): ${message}`);
    }
  } else if (error.request) {
    throw new Error('No response from AWS Batch API. Check your internet connection and region.');
  } else {
    throw error;
  }
}

// ============================================================
// JOBS
// ============================================================

export async function submitJob({ jobName, jobQueue, jobDefinition, parameters, containerOverrides }) {
  const client = getBatchClient();
  const body = {
    jobName,
    jobQueue,
    jobDefinition,
    ...(parameters && { parameters }),
    ...(containerOverrides && { containerOverrides })
  };
  const data = await client.request('POST', '/v1/submitjob', body);
  return data;
}

export async function describeJobs(jobIds) {
  const client = getBatchClient();
  const data = await client.request('POST', '/v1/describejobs', { jobs: jobIds });
  return data?.jobs || [];
}

export async function listJobs({ jobQueue, jobStatus, maxResults = 50 } = {}) {
  const client = getBatchClient();
  const body = {};
  if (jobQueue) body.jobQueue = jobQueue;
  if (jobStatus) body.jobStatus = jobStatus;
  if (maxResults) body.maxResults = maxResults;
  const data = await client.request('POST', '/v1/listjobs', body);
  return data?.jobSummaryList || [];
}

export async function terminateJob(jobId, reason) {
  const client = getBatchClient();
  const data = await client.request('POST', '/v1/terminatejob', {
    jobId,
    reason: reason || 'Terminated via CLI'
  });
  return data;
}

// ============================================================
// JOB QUEUES
// ============================================================

export async function listQueues() {
  const client = getBatchClient();
  const data = await client.request('GET', '/v1/jobqueues');
  return data?.jobQueues || [];
}

export async function getQueue(queueName) {
  const client = getBatchClient();
  const data = await client.request('GET', `/v1/jobqueues?jobQueues=${encodeURIComponent(queueName)}`);
  return (data?.jobQueues || [])[0] || null;
}

export async function createQueue({ queueName, state, priority, computeEnvironmentOrder }) {
  const client = getBatchClient();
  const body = {
    jobQueueName: queueName,
    state: state || 'ENABLED',
    priority: priority || 1,
    computeEnvironmentOrder: computeEnvironmentOrder || []
  };
  const data = await client.request('POST', '/v1/createjobqueue', body);
  return data;
}

export async function updateQueue({ queueName, state, priority }) {
  const client = getBatchClient();
  const body = { jobQueue: queueName };
  if (state) body.state = state;
  if (priority !== undefined) body.priority = priority;
  const data = await client.request('POST', '/v1/updatejobqueue', body);
  return data;
}

// ============================================================
// JOB DEFINITIONS
// ============================================================

export async function listDefinitions({ definitionName, status } = {}) {
  const client = getBatchClient();
  let path = '/v1/jobdefinitions';
  const params = [];
  if (definitionName) params.push(`jobDefinitionName=${encodeURIComponent(definitionName)}`);
  if (status) params.push(`status=${encodeURIComponent(status)}`);
  if (params.length) path += '?' + params.join('&');
  const data = await client.request('GET', path);
  return data?.jobDefinitions || [];
}

export async function describeDefinitions(definitionNames) {
  const client = getBatchClient();
  const path = `/v1/jobdefinitions?jobDefinitionName=${encodeURIComponent(definitionNames[0])}`;
  const data = await client.request('GET', path);
  return data?.jobDefinitions || [];
}

export async function registerDefinition({ definitionName, type, containerProperties }) {
  const client = getBatchClient();
  const body = {
    jobDefinitionName: definitionName,
    type: type || 'container',
    ...(containerProperties && { containerProperties })
  };
  const data = await client.request('POST', '/v1/registerjobdefinition', body);
  return data;
}
