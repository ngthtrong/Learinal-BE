/**
 * Script to generate complete Postman Collection for Learinal API
 * Run with: node scripts/generate-postman-collection.js
 */

const fs = require('fs');
const path = require('path');

const collection = {
  info: {
    name: 'Learinal API - Complete Collection',
    _postman_id: 'learinal-complete-2024-v1',
    description: `Complete Postman collection for Learinal Backend API

Includes:
- ✅ Email/Password Authentication
- ✅ Google OAuth 2.0 Flow  
- ✅ All API endpoints
- ✅ Admin endpoints
- ✅ Payment & Subscriptions
- ✅ Batch operations
- ✅ Import/Export features

Base URL: http://localhost:3001/api/v1`,
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    version: '1.0.0',
  },
  auth: {
    type: 'bearer',
    bearer: [{ key: 'token', value: '{{accessToken}}', type: 'string' }],
  },
  variable: [
    { key: 'baseUrl', value: 'http://localhost:3001/api/v1', type: 'string' },
    { key: 'accessToken', value: '', type: 'string' },
    { key: 'refreshToken', value: '', type: 'string' },
    { key: 'userId', value: '', type: 'string' },
    { key: 'subjectId', value: '', type: 'string' },
    { key: 'documentId', value: '', type: 'string' },
    { key: 'questionSetId', value: '', type: 'string' },
    { key: 'quizAttemptId', value: '', type: 'string' },
    { key: 'validationRequestId', value: '', type: 'string' },
    { key: 'commissionRecordId', value: '', type: 'string' },
    { key: 'subscriptionPlanId', value: '', type: 'string' },
    { key: 'userSubscriptionId', value: '', type: 'string' },
    { key: 'notificationId', value: '', type: 'string' },
    { key: 'flagId', value: '', type: 'string' },
    { key: 'oauthState', value: '', type: 'string' },
    { key: 'etag_me', value: '', type: 'string' },
    { key: 'sepayQrId', value: '', type: 'string' },
  ],
  item: [],
};

// Helper function to create a request
const req = (method, path, options = {}) => ({
  method,
  header: options.headers || [],
  ...(options.body && { body: options.body }),
  url: {
    raw: `{{baseUrl}}${path}`,
    host: ['{{baseUrl}}'],
    path: path.split('/').filter(Boolean),
    ...(options.query && { query: options.query }),
  },
  ...(options.description && { description: options.description }),
});

// Helper to create test script
const testScript = (code) => ({
  listen: 'test',
  script: { exec: code, type: 'text/javascript' },
});

// 1. HEALTH CHECK
collection.item.push({
  name: '🏥 Health Check',
  item: [
    {
      name: 'GET /health',
      request: {
        ...req('GET', '/health', { description: 'Check API health status' }),
        auth: { type: 'noauth' },
      },
    },
  ],
});

// 2. AUTHENTICATION
const authFolder = {
  name: '🔐 Authentication',
  item: [],
};

// 2.1 Email/Password Auth
const emailAuthFolder = {
  name: '📧 Email/Password Auth',
  item: [
    {
      name: 'POST /auth/register',
      event: [
        testScript([
          'if (pm.response.code === 201) {',
          '  const json = pm.response.json();',
          '  if (json.data && json.data.user) pm.collectionVariables.set("userId", json.data.user.id);',
          '  if (json.data && json.data.accessToken) pm.collectionVariables.set("accessToken", json.data.accessToken);',
          '  if (json.data && json.data.refreshToken) pm.collectionVariables.set("refreshToken", json.data.refreshToken);',
          '}',
        ]),
      ],
      request: {
        ...req('POST', '/auth/register', {
          description: 'Register new user with email and password',
          headers: [{ key: 'Content-Type', value: 'application/json' }],
          body: {
            mode: 'raw',
            raw: JSON.stringify(
              {
                fullName: 'Test User',
                email: 'testuser@example.com',
                password: 'SecurePass123!',
              },
              null,
              2
            ),
          },
        }),
        auth: { type: 'noauth' },
      },
    },
    {
      name: 'POST /auth/login',
      event: [
        testScript([
          'if (pm.response.code === 200) {',
          '  const json = pm.response.json();',
          '  if (json.data && json.data.accessToken) pm.collectionVariables.set("accessToken", json.data.accessToken);',
          '  if (json.data && json.data.refreshToken) pm.collectionVariables.set("refreshToken", json.data.refreshToken);',
          '  if (json.data && json.data.user) pm.collectionVariables.set("userId", json.data.user.id);',
          '}',
        ]),
      ],
      request: {
        ...req('POST', '/auth/login', {
          description: 'Login with email and password',
          headers: [{ key: 'Content-Type', value: 'application/json' }],
          body: {
            mode: 'raw',
            raw: JSON.stringify(
              {
                email: 'testuser@example.com',
                password: 'SecurePass123!',
              },
              null,
              2
            ),
          },
        }),
        auth: { type: 'noauth' },
      },
    },
    {
      name: 'POST /auth/verify-email',
      request: {
        ...req('POST', '/auth/verify-email', {
          description: 'Verify email address with token',
          headers: [{ key: 'Content-Type', value: 'application/json' }],
          body: {
            mode: 'raw',
            raw: JSON.stringify({ token: '<verification_token_from_email>' }, null, 2),
          },
        }),
        auth: { type: 'noauth' },
      },
    },
    {
      name: 'GET /auth/verify-email?token=...',
      request: {
        ...req('GET', '/auth/verify-email', {
          description: 'Verify email via GET (for clicking links in emails)',
          query: [{ key: 'token', value: '<verification_token>' }],
        }),
        auth: { type: 'noauth' },
      },
    },
    {
      name: 'POST /auth/resend-verification',
      request: {
        ...req('POST', '/auth/resend-verification', {
          description: 'Resend verification email',
          headers: [{ key: 'Content-Type', value: 'application/json' }],
          body: {
            mode: 'raw',
            raw: JSON.stringify({ email: 'testuser@example.com' }, null, 2),
          },
        }),
        auth: { type: 'noauth' },
      },
    },
    {
      name: 'POST /auth/forgot-password',
      request: {
        ...req('POST', '/auth/forgot-password', {
          description: 'Request password reset email',
          headers: [{ key: 'Content-Type', value: 'application/json' }],
          body: {
            mode: 'raw',
            raw: JSON.stringify({ email: 'testuser@example.com' }, null, 2),
          },
        }),
        auth: { type: 'noauth' },
      },
    },
    {
      name: 'POST /auth/reset-password',
      request: {
        ...req('POST', '/auth/reset-password', {
          description: 'Reset password with token from email',
          headers: [{ key: 'Content-Type', value: 'application/json' }],
          body: {
            mode: 'raw',
            raw: JSON.stringify(
              {
                token: '<reset_token_from_email>',
                newPassword: 'NewSecurePass456!',
              },
              null,
              2
            ),
          },
        }),
        auth: { type: 'noauth' },
      },
    },
  ],
};

// 2.2 Google OAuth Flow
const oauthFolder = {
  name: '🔵 Google OAuth Flow',
  item: [
    {
      name: 'GET /auth/config',
      event: [
        testScript([
          'if (pm.response.code === 200) {',
          '  const json = pm.response.json();',
          '  console.log("OAuth Config:", json);',
          '  console.log("");',
          '  console.log("To authenticate with Google:");',
          '  console.log("1. Get OAuth state from /auth/state");',
          '  console.log("2. Visit Google auth URL with state");',
          '  console.log("3. Exchange code for tokens via /auth/exchange");',
          '}',
        ]),
      ],
      request: {
        ...req('GET', '/auth/config', {
          description: 'Get OAuth configuration (client ID, redirect URI, etc.)',
        }),
        auth: { type: 'noauth' },
      },
    },
    {
      name: 'GET /auth/state',
      event: [
        testScript([
          'if (pm.response.code === 200) {',
          '  const json = pm.response.json();',
          '  if (json.state) {',
          '    pm.collectionVariables.set("oauthState", json.state);',
          '    console.log("OAuth State:", json.state);',
          '    console.log("TTL:", json.ttlMs, "ms");',
          '    console.log("");',
          '    console.log("Next: Visit the Google OAuth URL shown in the response");',
          '  }',
          '}',
        ]),
      ],
      request: {
        ...req('GET', '/auth/state', {
          description: 'Generate OAuth state token and set secure cookie for CSRF protection',
          query: [
            { key: 'manual', value: 'false', description: 'Set to true for manual OAuth flow testing' },
          ],
        }),
        auth: { type: 'noauth' },
      },
    },
    {
      name: 'POST /auth/exchange (OAuth Code → JWT)',
      event: [
        testScript([
          'if (pm.response.code === 200) {',
          '  const json = pm.response.json();',
          '  if (json.data && json.data.accessToken) pm.collectionVariables.set("accessToken", json.data.accessToken);',
          '  if (json.data && json.data.refreshToken) pm.collectionVariables.set("refreshToken", json.data.refreshToken);',
          '  if (json.data && json.data.user) pm.collectionVariables.set("userId", json.data.user.id);',
          '  console.log("OAuth Exchange successful!");',
          '  console.log("User:", json.data.user);',
          '}',
        ]),
      ],
      request: {
        ...req('POST', '/auth/exchange', {
          description:
            'Exchange Google OAuth code for access/refresh tokens. After getting the code from Google OAuth callback, paste it here.',
          headers: [{ key: 'Content-Type', value: 'application/json' }],
          body: {
            mode: 'raw',
            raw: JSON.stringify({ code: '<oauth_code_from_google>' }, null, 2),
          },
        }),
        auth: { type: 'noauth' },
      },
    },
  ],
};

authFolder.item.push(emailAuthFolder, oauthFolder);

// 2.3 Token Management
authFolder.item.push(
  {
    name: 'POST /auth/refresh',
    event: [
      testScript([
        'if (pm.response.code === 200) {',
        '  const json = pm.response.json();',
        '  if (json.data && json.data.accessToken) {',
        '    pm.collectionVariables.set("accessToken", json.data.accessToken);',
        '    console.log("Access token refreshed successfully!");',
        '  }',
        '}',
      ]),
    ],
    request: {
      ...req('POST', '/auth/refresh', {
        description: 'Refresh access token using refresh token',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: '{\n  "refreshToken": "{{refreshToken}}"\n}',
        },
      }),
      auth: { type: 'noauth' },
    },
  },
  {
    name: 'POST /auth/logout',
    request: {
      ...req('POST', '/auth/logout', {
        description: 'Logout and revoke refresh token',
      }),
      auth: { type: 'noauth' },
    },
  }
);

collection.item.push(authFolder);

// 3. USERS
collection.item.push({
  name: '👤 Users',
  item: [
    {
      name: 'GET /users/me',
      event: [
        testScript([
          'const etag = pm.response.headers.get("ETag");',
          'if (etag) {',
          '  pm.collectionVariables.set("etag_me", etag);',
          '  console.log("ETag captured:", etag);',
          '}',
        ]),
      ],
      request: req('GET', '/users/me', { description: 'Get current user profile' }),
    },
    {
      name: 'PATCH /users/me',
      request: req('PATCH', '/users/me', {
        description: 'Update current user profile (uses ETag for concurrency control)',
        headers: [
          { key: 'Content-Type', value: 'application/json' },
          { key: 'If-None-Match', value: '{{etag_me}}', description: 'ETag for optimistic concurrency' },
        ],
        body: {
          mode: 'raw',
          raw: JSON.stringify({ fullName: 'Updated Name', bio: 'My new bio' }, null, 2),
        },
      }),
    },
    {
      name: 'DELETE /users/me',
      request: req('DELETE', '/users/me', { description: 'Delete current user account' }),
    },
  ],
});

// 4. SUBJECTS
collection.item.push({
  name: '📚 Subjects',
  item: [
    {
      name: 'GET /subjects',
      request: req('GET', '/subjects', {
        description: 'List all subjects with pagination',
        query: [
          { key: 'page', value: '1' },
          { key: 'pageSize', value: '20' },
        ],
      }),
    },
    {
      name: 'POST /subjects',
      event: [
        testScript([
          'if (pm.response.code === 201) {',
          '  const json = pm.response.json();',
          '  if (json.data && json.data.id) {',
          '    pm.collectionVariables.set("subjectId", json.data.id);',
          '    console.log("Subject ID:", json.data.id);',
          '  }',
          '}',
        ]),
      ],
      request: req('POST', '/subjects', {
        description: 'Create a new subject',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify(
            { subjectName: 'Mathematics', description: 'Advanced mathematics topics' },
            null,
            2
          ),
        },
      }),
    },
    {
      name: 'GET /subjects/:id',
      request: req('GET', '/subjects/{{subjectId}}', { description: 'Get subject by ID' }),
    },
    {
      name: 'PATCH /subjects/:id',
      request: req('PATCH', '/subjects/{{subjectId}}', {
        description: 'Update subject',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({ description: 'Updated description for mathematics' }, null, 2),
        },
      }),
    },
    {
      name: 'DELETE /subjects/:id',
      request: req('DELETE', '/subjects/{{subjectId}}', { description: 'Delete subject' }),
    },
  ],
});

// 5. DOCUMENTS
collection.item.push({
  name: '📄 Documents',
  item: [
    {
      name: 'POST /documents (Upload)',
      event: [
        testScript([
          'if (pm.response.code === 201) {',
          '  const json = pm.response.json();',
          '  if (json.data && json.data.id) {',
          '    pm.collectionVariables.set("documentId", json.data.id);',
          '    console.log("Document ID:", json.data.id);',
          '  }',
          '}',
        ]),
      ],
      request: {
        method: 'POST',
        header: [],
        body: {
          mode: 'formdata',
          formdata: [
            { key: 'subjectId', value: '{{subjectId}}', type: 'text' },
            { key: 'file', type: 'file', src: [] },
          ],
        },
        url: {
          raw: '{{baseUrl}}/documents',
          host: ['{{baseUrl}}'],
          path: ['documents'],
        },
        description: 'Upload a document (PDF, DOCX, TXT, etc.)',
      },
    },
    {
      name: 'GET /documents/:id',
      request: req('GET', '/documents/{{documentId}}', { description: 'Get document metadata' }),
    },
    {
      name: 'GET /documents/:id/summary',
      request: req('GET', '/documents/{{documentId}}/summary', {
        description: 'Get AI-generated document summary',
      }),
    },
    {
      name: 'DELETE /documents/:id',
      request: req('DELETE', '/documents/{{documentId}}', { description: 'Delete document' }),
    },
  ],
});

// 6. QUESTION SETS
collection.item.push({
  name: '❓ Question Sets',
  item: [
    {
      name: 'GET /question-sets',
      request: req('GET', '/question-sets', {
        description: 'List all question sets',
        query: [
          { key: 'page', value: '1' },
          { key: 'pageSize', value: '20' },
        ],
      }),
    },
    {
      name: 'POST /question-sets/generate',
      event: [
        {
          listen: 'prerequest',
          script: {
            exec: [
              'if (!pm.request.headers.has("Idempotency-Key")) {',
              '  pm.request.headers.add({key: "Idempotency-Key", value: pm.variables.replaceIn("{{$guid}}")});',
              '}',
            ],
            type: 'text/javascript',
          },
        },
        testScript([
          'if (pm.response.code === 201) {',
          '  const json = pm.response.json();',
          '  if (json.data && json.data.id) {',
          '    pm.collectionVariables.set("questionSetId", json.data.id);',
          '    console.log("Question Set ID:", json.data.id);',
          '  }',
          '}',
        ]),
      ],
      request: req('POST', '/question-sets/generate', {
        description: 'Generate questions using AI',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify(
            {
              subjectId: '{{subjectId}}',
              title: 'Algebra Practice',
              numQuestions: 10,
              difficulty: 'Hiểu',
            },
            null,
            2
          ),
        },
      }),
    },
    {
      name: 'GET /question-sets/:id',
      request: req('GET', '/question-sets/{{questionSetId}}', { description: 'Get question set by ID' }),
    },
    {
      name: 'PATCH /question-sets/:id',
      request: req('PATCH', '/question-sets/{{questionSetId}}', {
        description: 'Update question set',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({ title: 'Updated Title' }, null, 2),
        },
      }),
    },
    {
      name: 'DELETE /question-sets/:id',
      request: req('DELETE', '/question-sets/{{questionSetId}}', { description: 'Delete question set' }),
    },
    {
      name: 'POST /question-sets/:id/share',
      request: req('POST', '/question-sets/{{questionSetId}}/share', {
        description: 'Share question set publicly',
      }),
    },
    {
      name: 'POST /question-sets/:id/review',
      request: req('POST', '/question-sets/{{questionSetId}}/review', {
        description: 'Request expert review for question set',
      }),
    },
  ],
});

// 7. QUIZ ATTEMPTS
collection.item.push({
  name: '🎯 Quiz Attempts',
  item: [
    {
      name: 'POST /quiz-attempts',
      event: [
        testScript([
          'if (pm.response.code === 201) {',
          '  const json = pm.response.json();',
          '  if (json.data && json.data.id) {',
          '    pm.collectionVariables.set("quizAttemptId", json.data.id);',
          '    console.log("Quiz Attempt ID:", json.data.id);',
          '  }',
          '}',
        ]),
      ],
      request: req('POST', '/quiz-attempts', {
        description: 'Start a new quiz attempt',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({ setId: '{{questionSetId}}' }, null, 2),
        },
      }),
    },
    {
      name: 'GET /quiz-attempts/:id',
      request: req('GET', '/quiz-attempts/{{quizAttemptId}}', { description: 'Get quiz attempt details' }),
    },
    {
      name: 'POST /quiz-attempts/:id/submit',
      request: req('POST', '/quiz-attempts/{{quizAttemptId}}/submit', {
        description: 'Submit quiz answers',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify(
            {
              answers: [
                { questionId: 'q1', selectedOptionIndex: 1 },
                { questionId: 'q2', selectedOptionIndex: 0 },
              ],
            },
            null,
            2
          ),
        },
      }),
    },
  ],
});

// 8. VALIDATION REQUESTS
collection.item.push({
  name: '✅ Validation Requests',
  item: [
    {
      name: 'GET /validation-requests',
      request: req('GET', '/validation-requests', {
        description: 'List validation requests',
        query: [
          { key: 'page', value: '1' },
          { key: 'pageSize', value: '20' },
        ],
      }),
    },
    {
      name: 'GET /validation-requests/:id',
      request: req('GET', '/validation-requests/{{validationRequestId}}', {
        description: 'Get validation request by ID',
      }),
    },
    {
      name: 'PATCH /validation-requests/:id',
      request: req('PATCH', '/validation-requests/{{validationRequestId}}', {
        description: 'Update validation request status',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({ status: 'Assigned', expertId: '{{userId}}' }, null, 2),
        },
      }),
    },
    {
      name: 'PATCH /validation-requests/:id/complete (Expert)',
      request: req('PATCH', '/validation-requests/{{validationRequestId}}/complete', {
        description: 'Complete validation (Expert only)',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify(
            {
              decision: 'Approved',
              feedback: 'Great work! All questions are accurate.',
              correctedQuestions: [],
            },
            null,
            2
          ),
        },
      }),
    },
  ],
});

// 9. COMMISSION RECORDS
collection.item.push({
  name: '💰 Commission Records',
  item: [
    {
      name: 'GET /commission-records',
      request: req('GET', '/commission-records', {
        description: 'List commission records (Expert/Admin)',
        query: [
          { key: 'page', value: '1' },
          { key: 'pageSize', value: '20' },
        ],
      }),
    },
    {
      name: 'GET /commission-records/summary',
      request: req('GET', '/commission-records/summary', {
        description: 'Get commission summary (Expert)',
      }),
    },
    {
      name: 'GET /commission-records/:id',
      request: req('GET', '/commission-records/{{commissionRecordId}}', {
        description: 'Get commission record by ID',
      }),
    },
    {
      name: 'PATCH /commission-records/:id/mark-paid (Admin)',
      request: req('PATCH', '/commission-records/{{commissionRecordId}}/mark-paid', {
        description: 'Mark commission as paid (Admin only)',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({ paymentReference: 'BANK_TRANSFER_98765' }, null, 2),
        },
      }),
    },
  ],
});

// 10. SUBSCRIPTION PLANS
collection.item.push({
  name: '📦 Subscription Plans',
  item: [
    {
      name: 'GET /subscription-plans (Public)',
      request: {
        ...req('GET', '/subscription-plans', { description: 'List all subscription plans (public)' }),
        auth: { type: 'noauth' },
      },
    },
    {
      name: 'POST /subscription-plans (Admin)',
      event: [
        testScript([
          'if (pm.response.code === 201) {',
          '  const json = pm.response.json();',
          '  if (json.data && json.data.plan && json.data.plan.id) {',
          '    pm.collectionVariables.set("subscriptionPlanId", json.data.plan.id);',
          '    console.log("Subscription Plan ID:", json.data.plan.id);',
          '  }',
          '}',
        ]),
      ],
      request: req('POST', '/subscription-plans', {
        description: 'Create subscription plan (Admin only)',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify(
            {
              planName: 'Premium Plan',
              description: 'Full access to all features',
              billingCycle: 'Monthly',
              price: 99000,
              entitlements: {
                maxMonthlyTestGenerations: 100,
                maxValidationRequests: 50,
                priorityProcessing: true,
                shareLimits: { canShare: true, maxSharedUsers: 20 },
                maxSubjects: 50,
              },
            },
            null,
            2
          ),
        },
      }),
    },
    {
      name: 'GET /subscription-plans/:id',
      request: {
        ...req('GET', '/subscription-plans/{{subscriptionPlanId}}', {
          description: 'Get subscription plan by ID',
        }),
        auth: { type: 'noauth' },
      },
    },
    {
      name: 'PATCH /subscription-plans/:id (Admin)',
      request: req('PATCH', '/subscription-plans/{{subscriptionPlanId}}', {
        description: 'Update subscription plan (Admin only)',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({ description: 'Updated description', price: 89000 }, null, 2),
        },
      }),
    },
    {
      name: 'DELETE /subscription-plans/:id (Admin)',
      request: req('DELETE', '/subscription-plans/{{subscriptionPlanId}}', {
        description: 'Archive subscription plan (Admin only)',
      }),
    },
  ],
});

// 11. USER SUBSCRIPTIONS
collection.item.push({
  name: '🔑 User Subscriptions',
  item: [
    {
      name: 'GET /user-subscriptions/me',
      request: req('GET', '/user-subscriptions/me', {
        description: 'Get current user subscription status',
      }),
    },
    {
      name: 'POST /user-subscriptions',
      event: [
        testScript([
          'if (pm.response.code === 201) {',
          '  const json = pm.response.json();',
          '  if (json.data && json.data.subscription && json.data.subscription.id) {',
          '    pm.collectionVariables.set("userSubscriptionId", json.data.subscription.id);',
          '    console.log("User Subscription ID:", json.data.subscription.id);',
          '  }',
          '}',
        ]),
      ],
      request: req('POST', '/user-subscriptions', {
        description: 'Create user subscription',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify(
            {
              planId: '{{subscriptionPlanId}}',
              paymentReference: 'PAYMENT_REF_12345',
            },
            null,
            2
          ),
        },
      }),
    },
    {
      name: 'DELETE /user-subscriptions/:id (Cancel)',
      request: req('DELETE', '/user-subscriptions/{{userSubscriptionId}}', {
        description: 'Cancel subscription',
      }),
    },
  ],
});

// 12. NOTIFICATIONS
collection.item.push({
  name: '🔔 Notifications',
  item: [
    {
      name: 'GET /notifications',
      request: req('GET', '/notifications', {
        description: 'List user notifications',
        query: [
          { key: 'page', value: '1' },
          { key: 'pageSize', value: '20' },
        ],
      }),
    },
    {
      name: 'PATCH /notifications/:id',
      request: req('PATCH', '/notifications/{{notificationId}}', {
        description: 'Mark notification as read',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({ isRead: true }, null, 2),
        },
      }),
    },
  ],
});

// 13. MODERATION
collection.item.push({
  name: '🛡️ Moderation',
  item: [
    {
      name: 'POST /moderation/flag',
      request: req('POST', '/moderation/flag', {
        description: 'Flag content for moderation',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify(
            {
              contentType: 'QuestionSet',
              contentId: '{{questionSetId}}',
              reason: 'Inappropriate content',
              details: 'Contains offensive material',
            },
            null,
            2
          ),
        },
      }),
    },
    {
      name: 'GET /moderation/flags (Admin)',
      request: req('GET', '/moderation/flags', {
        description: 'List moderation flags (Admin only)',
        query: [
          { key: 'page', value: '1' },
          { key: 'pageSize', value: '20' },
        ],
      }),
    },
    {
      name: 'PATCH /moderation/flags/:id/review (Admin)',
      request: req('PATCH', '/moderation/flags/{{flagId}}/review', {
        description: 'Review flag (Admin only)',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify(
            {
              action: 'Remove',
              moderatorNotes: 'Content violates community guidelines',
            },
            null,
            2
          ),
        },
      }),
    },
    {
      name: 'PATCH /moderation/flags/:id/dismiss (Admin)',
      request: req('PATCH', '/moderation/flags/{{flagId}}/dismiss', {
        description: 'Dismiss flag (Admin only)',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({ moderatorNotes: 'False report' }, null, 2),
        },
      }),
    },
  ],
});

// 14. SEARCH
collection.item.push({
  name: '🔍 Search',
  item: [
    {
      name: 'GET /search',
      request: req('GET', '/search', {
        description: 'Global search across content',
        query: [
          { key: 'q', value: 'mathematics' },
          { key: 'page', value: '1' },
          { key: 'pageSize', value: '20' },
        ],
      }),
    },
    {
      name: 'GET /search/question-sets',
      request: req('GET', '/search/question-sets', {
        description: 'Advanced question set filtering',
        query: [
          { key: 'difficulty', value: 'Hiểu' },
          { key: 'subjectId', value: '{{subjectId}}' },
          { key: 'page', value: '1' },
        ],
      }),
    },
  ],
});

// 15. BATCH OPERATIONS
collection.item.push({
  name: '📦 Batch Operations',
  item: [
    {
      name: 'POST /batch/question-sets/delete',
      request: req('POST', '/batch/question-sets/delete', {
        description: 'Batch delete question sets (Expert/Admin)',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({ ids: ['id1', 'id2', 'id3'] }, null, 2),
        },
      }),
    },
    {
      name: 'POST /batch/question-sets/publish',
      request: req('POST', '/batch/question-sets/publish', {
        description: 'Batch publish question sets (Expert/Admin)',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({ ids: ['id1', 'id2', 'id3'] }, null, 2),
        },
      }),
    },
    {
      name: 'POST /batch/question-sets/unpublish',
      request: req('POST', '/batch/question-sets/unpublish', {
        description: 'Batch unpublish question sets (Expert/Admin)',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({ ids: ['id1', 'id2', 'id3'] }, null, 2),
        },
      }),
    },
    {
      name: 'PATCH /batch/question-sets/update',
      request: req('PATCH', '/batch/question-sets/update', {
        description: 'Batch update question sets (Expert/Admin)',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify(
            {
              ids: ['id1', 'id2', 'id3'],
              updates: { difficulty: 'Vận dụng' },
            },
            null,
            2
          ),
        },
      }),
    },
    {
      name: 'POST /batch/documents/delete',
      request: req('POST', '/batch/documents/delete', {
        description: 'Batch delete documents',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({ ids: ['doc1', 'doc2', 'doc3'] }, null, 2),
        },
      }),
    },
  ],
});

// 16. EXPORT
collection.item.push({
  name: '📤 Export',
  item: [
    {
      name: 'GET /export/question-sets/:id/json',
      request: req('GET', '/export/question-sets/{{questionSetId}}/json', {
        description: 'Export question set as JSON',
      }),
    },
    {
      name: 'GET /export/question-sets/:id/csv',
      request: req('GET', '/export/question-sets/{{questionSetId}}/csv', {
        description: 'Export question set as CSV',
      }),
    },
    {
      name: 'GET /export/question-sets/:id/pdf',
      request: req('GET', '/export/question-sets/{{questionSetId}}/pdf', {
        description: 'Export question set as PDF',
      }),
    },
    {
      name: 'POST /export/question-sets/batch',
      request: req('POST', '/export/question-sets/batch', {
        description: 'Batch export multiple question sets',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify(
            {
              ids: ['id1', 'id2', 'id3'],
              format: 'json',
            },
            null,
            2
          ),
        },
      }),
    },
  ],
});

// 17. IMPORT
collection.item.push({
  name: '📥 Import',
  item: [
    {
      name: 'POST /import/question-sets/json',
      request: {
        method: 'POST',
        header: [],
        body: {
          mode: 'formdata',
          formdata: [
            { key: 'file', type: 'file', src: [] },
            { key: 'subjectId', value: '{{subjectId}}', type: 'text' },
          ],
        },
        url: {
          raw: '{{baseUrl}}/import/question-sets/json',
          host: ['{{baseUrl}}'],
          path: ['import', 'question-sets', 'json'],
        },
        description: 'Import question set from JSON file',
      },
    },
    {
      name: 'POST /import/question-sets/csv',
      request: {
        method: 'POST',
        header: [],
        body: {
          mode: 'formdata',
          formdata: [
            { key: 'file', type: 'file', src: [] },
            { key: 'subjectId', value: '{{subjectId}}', type: 'text' },
          ],
        },
        url: {
          raw: '{{baseUrl}}/import/question-sets/csv',
          host: ['{{baseUrl}}'],
          path: ['import', 'question-sets', 'csv'],
        },
        description: 'Import question set from CSV file',
      },
    },
    {
      name: 'POST /import/question-sets/batch',
      request: {
        method: 'POST',
        header: [],
        body: {
          mode: 'formdata',
          formdata: [
            { key: 'files', type: 'file', src: [] },
            { key: 'subjectId', value: '{{subjectId}}', type: 'text' },
          ],
        },
        url: {
          raw: '{{baseUrl}}/import/question-sets/batch',
          host: ['{{baseUrl}}'],
          path: ['import', 'question-sets', 'batch'],
        },
        description: 'Batch import multiple question sets',
      },
    },
  ],
});

// 18. PAYMENTS
collection.item.push({
  name: '💳 Payments (Sepay)',
  item: [
    {
      name: 'POST /payments/sepay/qr',
      event: [
        testScript([
          'if (pm.response.code === 200) {',
          '  const json = pm.response.json();',
          '  if (json.data && json.data.qrId) {',
          '    pm.collectionVariables.set("sepayQrId", json.data.qrId);',
          '    console.log("Sepay QR ID:", json.data.qrId);',
          '  }',
          '}',
        ]),
      ],
      request: req('POST', '/payments/sepay/qr', {
        description: 'Generate Sepay QR code for payment',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify(
            {
              amount: 99000,
              description: 'Premium subscription payment',
            },
            null,
            2
          ),
        },
      }),
    },
    {
      name: 'GET /payments/sepay/transactions',
      request: req('GET', '/payments/sepay/transactions', {
        description: 'List Sepay transactions (debug/ops)',
        query: [
          { key: 'page', value: '1' },
          { key: 'limit', value: '20' },
        ],
      }),
    },
    {
      name: 'POST /payments/sepay/scan',
      request: req('POST', '/payments/sepay/scan', {
        description: 'Scan for new Sepay transactions (Admin)',
      }),
    },
  ],
});

// 19. WEBHOOKS
collection.item.push({
  name: '🔗 Webhooks',
  item: [
    {
      name: 'POST /webhooks/sepay',
      request: {
        ...req('POST', '/webhooks/sepay', {
          description: 'Sepay webhook callback (external)',
          headers: [{ key: 'Content-Type', value: 'application/json' }],
          body: {
            mode: 'raw',
            raw: JSON.stringify(
              {
                transactionId: 'TXN123456',
                amount: 99000,
                status: 'success',
                // ... other webhook data
              },
              null,
              2
            ),
          },
        }),
        auth: { type: 'noauth' },
      },
    },
  ],
});

// 20. ADMIN
collection.item.push({
  name: '👑 Admin',
  item: [
    {
      name: 'GET /admin/users',
      request: req('GET', '/admin/users', {
        description: 'List all users (Admin only)',
        query: [
          { key: 'page', value: '1' },
          { key: 'pageSize', value: '20' },
          { key: 'role', value: '', description: 'Filter by role: Learner, Expert, Admin' },
        ],
      }),
    },
  ],
});

// Write to file
const outputPath = path.join(__dirname, '..', 'Learinal-Complete.postman_collection.json');
fs.writeFileSync(outputPath, JSON.stringify(collection, null, 2), 'utf8');

console.log('✅ Postman Collection generated successfully!');
console.log('📁 File:', outputPath);
console.log('');
console.log('📋 Collection includes:');
console.log('   🏥 Health Check');
console.log('   🔐 Authentication (Email/Password + Google OAuth)');
console.log('   👤 Users');
console.log('   📚 Subjects');
console.log('   📄 Documents');
console.log('   ❓ Question Sets');
console.log('   🎯 Quiz Attempts');
console.log('   ✅ Validation Requests');
console.log('   💰 Commission Records');
console.log('   📦 Subscription Plans');
console.log('   🔑 User Subscriptions');
console.log('   🔔 Notifications');
console.log('   🛡️ Moderation');
console.log('   🔍 Search');
console.log('   📦 Batch Operations');
console.log('   📤 Export');
console.log('   📥 Import');
console.log('   💳 Payments (Sepay)');
console.log('   🔗 Webhooks');
console.log('   👑 Admin');
console.log('');
console.log('🚀 Import this file into Postman to get started!');
