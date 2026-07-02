# Vehicle Alert Management System (VAMS) - API Specifications

This document outlines the API endpoints, payload formats, authentication headers, webhook structures, and WebSocket schemas for the VAMS backend.

---

## 1. Global Specifications

- **Base URL**: `https://api.vams-platform.com/api/v1`
- **Headers**:
  - `Content-Type: application/json`
  - `Authorization: Bearer <JWT_TOKEN>` (Required for all authenticated endpoints)
  - `X-Company-ID: <UUID>` (Optional / Verified against token payload for strict validation)

---

## 2. Authentication & User Management

### 2.1 User Login
* **Endpoint**: `POST /auth/login`
* **Access**: Public
* **Request Payload**:
```json
{
  "email": "supervisor.john@company.com",
  "password": "SecurePassword123"
}
```
* **Success Response (200 OK)**:
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsIn...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsIn...",
  "user": {
    "id": "e30fa27d-f421-49e0-82a8-fdbd5bc2c30a",
    "name": "John Doe",
    "email": "supervisor.john@company.com",
    "role": "SUPERVISOR",
    "companyId": "b812efd9-a412-4011-9a99-b1d5e3cdae01"
  }
}
```

---

## 3. Defect Master Management

### 3.1 Create Defect Master
* **Endpoint**: `POST /defects`
* **Access**: Admin, Factory Manager
* **Request Payload**:
```json
{
  "name": "Brake System Fluid Leak",
  "category": "Brake System",
  "severity": "CRITICAL",
  "defaultAssigneeRole": "QUALITY_INSPECTOR",
  "ownerVisible": true,
  "soundProfile": "CRITICAL"
}
```
* **Success Response (21 Created)**:
```json
{
  "id": "782f9d1a-be10-4bf6-82bd-02c3a5ef59a2",
  "name": "Brake System Fluid Leak",
  "category": "Brake System",
  "severity": "CRITICAL",
  "defaultAssigneeRole": "QUALITY_INSPECTOR",
  "ownerVisible": true,
  "soundProfile": "CRITICAL",
  "active": true,
  "companyId": "b812efd9-a412-4011-9a99-b1d5e3cdae01",
  "createdAt": "2026-06-24T05:00:00.000Z"
}
```

### 3.2 List Defect Master Definitions
* **Endpoint**: `GET /defects`
* **Access**: Authenticated users of the company
* **Success Response (200 OK)**:
```json
[
  {
    "id": "782f9d1a-be10-4bf6-82bd-02c3a5ef59a2",
    "name": "Brake System Fluid Leak",
    "category": "Brake System",
    "severity": "CRITICAL",
    "active": true
  }
]
```

---

## 4. Alert Ingestion (Event API)

Used by external integration partners (e.g. Vision/Voice inspection scripts running on manufacturing lines, Recall systems).

### 4.1 Ingest Event
* **Endpoint**: `POST /events`
* **Access**: Authorized Integration Service (API Key authenticated)
* **Request Payload**:
```json
{
  "source": "voice-inspection",
  "event_type": "DEFECT_CREATED",
  "company_id": "b812efd9-a412-4011-9a99-b1d5e3cdae01",
  "vin": "MALXW35848DJ29103",
  "defect_name": "Brake System Fluid Leak"
}
```
* **Success Response (202 Accepted)**:
```json
{
  "event_id": "90ba95ef-cd28-4e8c-848e-28ca7b18dfa8",
  "alert_id": "cfa3410c-99a3-48ee-bd73-c1ea29b8de01",
  "status": "QUEUED",
  "message": "Defect created and routed successfully."
}
```

---

## 5. Alert Action APIs

### 5.1 Reassign Alert
* **Endpoint**: `PATCH /alerts/:id/assign`
* **Access**: Supervisor, Manager, Admin
* **Request Payload**:
```json
{
  "assignedToUserId": "d50a29e4-bcde-4211-8fa1-71ca36df201a",
  "assignedToRole": "WORKER",
  "assignedToDepartment": "Assembly Line B",
  "assignedToTeam": "Hydraulics Team",
  "notes": "Reassigned to John Doe for urgent line inspection."
}
```
* **Success Response (200 OK)**:
```json
{
  "id": "cfa3410c-99a3-48ee-bd73-c1ea29b8de01",
  "status": "IN_PROGRESS",
  "assignedToUserId": "d50a29e4-bcde-4211-8fa1-71ca36df201a",
  "updatedAt": "2026-06-24T05:15:00.000Z"
}
```

### 5.2 Resolve Alert
Allows attachments, images, and audio path + text transcriptions.
* **Endpoint**: `POST /alerts/:id/resolve`
* **Access**: Worker, Supervisor, Inspector, Engineer
* **Request Payload**:
```json
{
  "reason": "Replaced hydraulic seal and bleed brakes.",
  "notes": "Testing shows zero leaks under operating pressure.",
  "audioPath": "uploads/company_b/resolutions/res_cfa3410c.wav",
  "transcription": "Brake oil leak repaired and tested.",
  "imageUrls": [
    "https://s3.vams-platform.com/uploads/company_b/images/seal_repair_before.png",
    "https://s3.vams-platform.com/uploads/company_b/images/seal_repair_after.png"
  ]
}
```
* **Success Response (200 OK)**:
```json
{
  "id": "cfa3410c-99a3-48ee-bd73-c1ea29b8de01",
  "status": "RESOLVED",
  "resolution": {
    "id": "f51e39a2-921c-43bd-bd7d-ee2f1839db02",
    "resolvedByUserId": "d50a29e4-bcde-4211-8fa1-71ca36df201a",
    "resolvedAt": "2026-06-24T05:30:00.000Z",
    "transcription": "Brake oil leak repaired and tested."
  }
}
```

### 5.3 Reopen Alert
* **Endpoint**: `POST /alerts/:id/reopen`
* **Access**: Supervisor, Manager, Admin
* **Request Payload**:
```json
{
  "reason": "Test fail on assembly line. Leak still present."
}
```
* **Success Response (200 OK)**:
```json
{
  "id": "cfa3410c-99a3-48ee-bd73-c1ea29b8de01",
  "status": "REOPENED"
}
```

---

## 6. Multimedia APIs

### 6.1 Upload Resolution Media (Audio/Images)
* **Endpoint**: `POST /media/upload`
* **Access**: Authenticated Users
* **Content-Type**: `multipart/form-data`
* **Parameters**:
  - `file`: Binary file upload
  - `purpose`: `AUDIO_RESOLUTION` or `IMAGE_RESOLUTION`
* **Success Response (201 Created)**:
```json
{
  "fileUrl": "https://s3.vams-platform.com/uploads/company_b/audio/voice_note_12345.wav",
  "fileName": "voice_note_12345.wav",
  "mimeType": "audio/wav"
}
```

### 6.2 Get Audio Transcription
If transcription is processed asynchronously (e.g. using AI Speech-to-Text), this endpoint allows retrieving details manually.
* **Endpoint**: `GET /media/transcription/:fileId`
* **Success Response (200 OK)**:
```json
{
  "fileId": "voice_note_12345.wav",
  "status": "COMPLETED",
  "transcription": "Brake oil leak repaired and tested."
}
```

---

## 7. Real-Time WebSocket Events (Socket.IO)

Clients connect to `wss://api.vams-platform.com` and must pass standard JWT token inside query parameters.

### 7.1 Connection Payload
```javascript
const socket = io("wss://api.vams-platform.com", {
  query: {
    token: "eyJhbGciOiJIUzI1NiIsIn..."
  }
});
```

### 7.2 Emitted Events (Server to Client)

#### `ALERT_CREATED`
Sent to all clients connected to the company room `company_{companyId}`.
```json
{
  "event": "ALERT_CREATED",
  "data": {
    "alertId": "cfa3410c-99a3-48ee-bd73-c1ea29b8de01",
    "vin": "MALXW35848DJ29103",
    "defectName": "Brake System Fluid Leak",
    "severity": "CRITICAL",
    "soundProfile": "CRITICAL", // Clients play standard alarm sound
    "createdAt": "2026-06-24T05:00:00.000Z"
  }
}
```

#### `ALERT_ASSIGNED`
```json
{
  "event": "ALERT_ASSIGNED",
  "data": {
    "alertId": "cfa3410c-99a3-48ee-bd73-c1ea29b8de01",
    "assignedToUserId": "d50a29e4-bcde-4211-8fa1-71ca36df201a",
    "assignedToRole": "WORKER"
  }
}
```

#### `ALERT_ESCALATED`
```json
{
  "event": "ALERT_ESCALATED",
  "data": {
    "alertId": "cfa3410c-99a3-48ee-bd73-c1ea29b8de01",
    "steppedToRole": "SUPERVISOR",
    "escalatedAt": "2026-06-24T05:20:00.000Z"
  }
}
```
