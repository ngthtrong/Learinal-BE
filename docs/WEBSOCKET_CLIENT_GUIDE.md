# WebSocket Real-time Notifications - Client Integration Guide

## Overview
Phase 3.4 implements Socket.IO for real-time notifications. This guide shows how to connect from the frontend.

## Server Setup
- **URL**: `ws://localhost:3000` (or production URL)
- **Path**: `/socket.io/`
- **Authentication**: JWT token via `auth.token`
- **Transports**: WebSocket (primary), Polling (fallback)

## Client Connection (JavaScript/React)

### 1. Install Socket.IO Client
```bash
npm install socket.io-client
```

### 2. Connect with Authentication
```javascript
import { io } from 'socket.io-client';

const token = localStorage.getItem('jwtToken'); // Your JWT token

const socket = io('http://localhost:3000', {
  path: '/socket.io/',
  auth: {
    token: token
  },
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

// Connection events
socket.on('connect', () => {
  console.log('✓ Connected to WebSocket server');
});

socket.on('connected', (data) => {
  console.log('Welcome message:', data);
  // { userId: '...', message: '...', timestamp: '...' }
});

socket.on('disconnect', (reason) => {
  console.log('✗ Disconnected:', reason);
});

socket.on('error', (error) => {
  console.error('Socket error:', error);
});
```

### 3. Listen to Real-time Events

#### Validation Assigned (Expert receives)
```javascript
socket.on('validation.assigned', (data) => {
  console.log('New validation request assigned!', data);
  /*
  {
    type: 'validation.assigned',
    data: {
      validationRequestId: '...',
      questionSetId: '...',
      requestedBy: '...',
      createdAt: '...'
    },
    timestamp: '2025-11-02T...'
  }
  */
  
  // Show notification to expert
  showNotification('New Validation Request', 'You have a new question set to review');
});
```

#### Validation Completed (Learner receives)
```javascript
socket.on('validation.completed', (data) => {
  console.log('Validation completed!', data);
  /*
  {
    type: 'validation.completed',
    data: {
      validationRequestId: '...',
      questionSetId: '...',
      status: 'Completed',
      reviewedBy: '...',
      completedAt: '...'
    },
    timestamp: '...'
  }
  */
  
  // Update UI
  updateQuestionSetStatus(data.data.questionSetId, 'Validated');
});
```

#### Quiz Completed
```javascript
socket.on('quiz.completed', (data) => {
  console.log('Quiz finished!', data);
  /*
  {
    type: 'quiz.completed',
    data: {
      quizAttemptId: '...',
      questionSetId: '...',
      score: 85,
      totalQuestions: 20,
      completedAt: '...'
    },
    timestamp: '...'
  }
  */
  
  // Show score modal
  showScoreModal(data.data.score);
});
```

#### Document Processed
```javascript
socket.on('document.processed', (data) => {
  console.log('Document ready!', data);
  /*
  {
    type: 'document.processed',
    data: {
      documentId: '...',
      fileName: 'lecture.pdf',
      status: 'Completed',
      summary: 'This document discusses...'
    },
    timestamp: '...'
  }
  */
  
  // Enable "Generate Questions" button
  enableQuestionGeneration(data.data.documentId);
});
```

#### Question Set Generated
```javascript
socket.on('questionSet.generated', (data) => {
  console.log('Questions generated!', data);
  /*
  {
    type: 'questionSet.generated',
    data: {
      questionSetId: '...',
      title: 'Chapter 1 Quiz',
      totalQuestions: 15,
      status: 'draft'
    },
    timestamp: '...'
  }
  */
  
  // Navigate to question set
  router.push(`/question-sets/${data.data.questionSetId}`);
});
```

#### Generic Notification
```javascript
socket.on('notification', (data) => {
  console.log('Notification:', data);
  /*
  {
    type: 'notification',
    data: {
      title: 'System Update',
      message: 'New features available!',
      type: 'info'
    },
    timestamp: '...'
  }
  */
  
  // Show toast notification
  toast.info(data.data.message);
});
```

#### System Announcement (Broadcast)
```javascript
socket.on('system.announcement', (data) => {
  console.log('System announcement:', data);
  /*
  {
    type: 'system.announcement',
    data: {
      title: 'Maintenance Notice',
      message: 'Server will be down...',
      priority: 'high'
    },
    timestamp: '...'
  }
  */
  
  // Show prominent banner
  showAnnouncementBanner(data.data);
});
```

#### Commission Earned (Expert)
```javascript
socket.on('commission.earned', (data) => {
  console.log('Commission earned!', data);
  /*
  {
    type: 'commission.earned',
    data: {
      commissionId: '...',
      amount: 50000,
      validationRequestId: '...',
      earnedAt: '...'
    },
    timestamp: '...'
  }
  */
  
  // Update balance display
  updateCommissionBalance(data.data.amount);
});
```

#### Subscription Updated
```javascript
socket.on('subscription.updated', (data) => {
  console.log('Subscription changed:', data);
  /*
  {
    type: 'subscription.updated',
    data: {
      subscriptionId: '...',
      planName: 'Premium',
      status: 'active',
      endDate: '2026-01-01'
    },
    timestamp: '...'
  }
  */
  
  // Reload user subscription
  fetchSubscriptionDetails();
});
```

### 4. Send Events (Ping for Testing)
```javascript
socket.emit('ping', (response) => {
  console.log('Pong:', response);
  // { timestamp: 1730534400000 }
});
```

### 5. Cleanup on Unmount (React)
```javascript
useEffect(() => {
  // Setup socket listeners
  socket.on('validation.assigned', handleValidationAssigned);
  socket.on('quiz.completed', handleQuizCompleted);
  
  return () => {
    // Cleanup
    socket.off('validation.assigned', handleValidationAssigned);
    socket.off('quiz.completed', handleQuizCompleted);
  };
}, []);
```

### 6. Disconnect on Logout
```javascript
function logout() {
  socket.disconnect();
  localStorage.removeItem('jwtToken');
  // ... rest of logout logic
}
```

## Testing Endpoints (Admin Only)

### Send Test Notification
```javascript
POST /api/v1/notifications/test
Authorization: Bearer <admin-token>

{
  "userId": "673482...",
  "message": "This is a test notification"
}
```

### Broadcast Announcement
```javascript
POST /api/v1/notifications/broadcast
Authorization: Bearer <admin-token>

{
  "title": "System Maintenance",
  "message": "Server will restart at 2 AM",
  "priority": "high"
}
```

### Check Connection Status
```javascript
GET /api/v1/notifications/status
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "enabled": true,
    "totalConnections": 5,
    "connectedUsers": 5
  }
}
```

## Event Types Summary

| Event | Direction | Who Receives | Trigger |
|-------|-----------|--------------|---------|
| `connected` | Server → Client | Current user | On connection |
| `validation.assigned` | Server → Client | Expert | Admin assigns validation |
| `validation.completed` | Server → Client | Learner | Expert completes review |
| `quiz.completed` | Server → Client | Learner | Quiz submission |
| `document.processed` | Server → Client | Uploader | Document ingestion done |
| `questionSet.generated` | Server → Client | Creator | Questions generated |
| `notification` | Server → Client | Specific user | Manual notification |
| `system.announcement` | Server → All | All connected users | Admin broadcast |
| `commission.earned` | Server → Client | Expert | Validation completed |
| `subscription.updated` | Server → Client | User | Subscription change |

## Room/Channel System

Users automatically join:
- **Personal room**: `user:<userId>` - Receive personal notifications
- **Role room**: `role:<role>` - Receive role-specific broadcasts (learner, expert, admin)

## Error Handling

```javascript
socket.on('connect_error', (error) => {
  console.error('Connection error:', error.message);
  
  if (error.message.includes('Authentication')) {
    // Token expired or invalid
    refreshToken();
  }
});

socket.on('reconnect_failed', () => {
  console.error('Failed to reconnect after 5 attempts');
  showOfflineMode();
});
```

## Best Practices

1. ✅ **Always authenticate** - Include JWT token in `auth.token`
2. ✅ **Handle reconnection** - Socket.IO handles this automatically
3. ✅ **Clean up listeners** - Remove listeners on component unmount
4. ✅ **Disconnect on logout** - Prevent memory leaks
5. ✅ **Show connection status** - Visual indicator for users
6. ✅ **Handle offline mode** - Graceful degradation when WebSocket unavailable
7. ✅ **Debounce UI updates** - Prevent excessive re-renders from rapid events

## Production Checklist

- [ ] Set `FRONTEND_URL` env variable for CORS
- [ ] Use WSS (WebSocket Secure) in production
- [ ] Monitor connection count and memory usage
- [ ] Implement reconnection backoff strategy
- [ ] Add logging for debugging
- [ ] Test with multiple concurrent users
- [ ] Set up health checks for WebSocket endpoint

## Environment Variables

```env
# Backend (.env)
FRONTEND_URL=https://learinal.app
JWT_SECRET=your-secret-key

# Frontend
REACT_APP_WS_URL=wss://api.learinal.app
```
