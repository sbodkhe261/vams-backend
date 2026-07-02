# Vehicle Alert Management System (VAMS) - System Architecture & Design

This document details the high-level architecture, design specifications, and implementation topologies for the multi-tenant Vehicle Alert Management System (VAMS). It covers the design patterns, databases, message routing, escalation policies, security layers, and enterprise scale strategies.

---

## 1. Logical System Architecture

VAMS adopts an event-driven microservices architecture to process inputs from external applications (Voice/Vision inspection, Manufacturing, Fleet, etc.) and deliver real-time, low-latency updates and notifications.

### High-Level Architecture Diagram
```mermaid
graph TD
    subgraph Clients ["Client Applications"]
        AndroidApp["Android App (Inspection/Fleet)"]
        WebDashboard["Web Dashboard (React/Vite)"]
    end

    subgraph Edge ["Edge / Entry Layer"]
        Nginx["Nginx Reverse Proxy / Load Balancer"]
        Gateway["API Gateway (Auth & Rate Limiting)"]
    end

    subgraph Application ["VAMS Core Application Layer (NestJS)"]
        AuthSvc["Auth Module (JWT & RBAC)"]
        AlertEngine["Alert Engine Module"]
        EscalationEngine["Escalation Engine Module"]
        NotificationEngine["Notification Module"]
        RealtimeGateway["Socket.IO Gateway"]
        StorageSvc["Storage Module (S3/MinIO)"]
    end

    subgraph DataQueue ["Message Queuing & Cache Layer"]
        Redis["Redis (Cache & Socket.IO Adapter)"]
        BullMQ["BullMQ (Processing Queues)"]
    end

    subgraph StorageLayer ["Data Storage Layer"]
        Postgres[("PostgreSQL (Multi-tenant DB)")]
        S3Bucket[("Object Storage (S3 / MinIO)")]
    end

    subgraph External ["External Services"]
        Firebase["Firebase Cloud Messaging (FCM)"]
        EmailProvider["SMTP / SES Email Gateways"]
    end

    %% Routing Flow
    Clients <-->|REST / WebSockets| Nginx
    Nginx <--> Gateway
    Gateway --> AuthSvc
    Gateway --> AlertEngine
    Gateway --> RealtimeGateway

    %% Queue and cache interactions
    AlertEngine -->|Enqueues Alert Events| BullMQ
    EscalationEngine -->|Scheduled Escalations| BullMQ
    BullMQ <--> Redis
    BullMQ --> NotificationEngine

    %% Database and storage interactions
    Application -->|Prisma Client| Postgres
    StorageSvc -->|Audio/Images| S3Bucket

    %% Notifications out
    NotificationEngine --> Firebase
    NotificationEngine --> EmailProvider
```

---

## 2. Multi-Tenant Database ER Diagram

To guarantee data isolation while achieving resource efficiency, VAMS implements **application-level schema sharing with Logical Tenant Isolation** via `company_id`. Every query must target a company index to prevent cross-company leakage.

```mermaid
erDiagram
    COMPANIES ||--o{ USERS : "has"
    COMPANIES ||--o{ DEFECT_MASTERS : "defines"
    COMPANIES ||--o{ ALERTS : "records"
    COMPANIES ||--o{ COMPANY_ALERT_RULES : "configures"
    COMPANIES ||--o{ ESCALATION_RULES : "sets"
    COMPANIES ||--o{ NOTIFICATIONS : "audits"
    COMPANIES ||--|| COMPANY_SETTINGS : "specifies"

    USERS ||--o{ ALERTS : "assigned"
    USERS ||--o{ ALERTS : "created"
    USERS ||--o{ RESOLUTIONS : "resolves"
    USERS ||--o{ RESOLUTION_COMMENTS : "comments"
    USERS ||--o{ NOTIFICATIONS : "receives"
    USERS ||--o{ NOTIFICATION_PREFERENCES : "customizes"
    USERS ||--o{ USER_ACTIVITY_LOGS : "logs"

    DEFECT_MASTERS ||--o{ ALERTS : "instantiates"

    ALERTS ||--o{ RESOLUTIONS : "resolved_by"
    ALERTS ||--o{ RESOLUTION_COMMENTS : "has_comments"
    ALERTS ||--o{ DEFECT_RESOLUTION_TIMELINE : "logs_history"
    ALERTS ||--o{ ALERT_ASSIGNMENT_HISTORIES : "tracks_assignment"
    ALERTS ||--o{ ESCALATION_HISTORIES : "tracks_escalations"
    ALERTS ||--o{ NOTIFICATIONS : "triggers"

    COMPANIES {
        uuid id PK
        string name
        boolean isActive
        timestamp createdAt
        timestamp updatedAt
    }

    COMPANY_SETTINGS {
        uuid id PK
        uuid companyId FK
        string soundInfo
        string soundWarning
        string soundCritical
        string soundEmergency
        int escalationGraceMin
    }

    USERS {
        uuid id PK
        string email
        string passwordHash
        string name
        string role
        uuid companyId FK
        boolean isActive
    }

    DEFECT_MASTERS {
        uuid id PK
        string name
        string category
        string severity
        string defaultAssigneeRole
        boolean ownerVisible
        string soundProfile
        boolean active
        uuid companyId FK
    }

    COMPANY_ALERT_RULES {
        uuid id PK
        uuid companyId FK
        string severity
        string[] rolesToNotify
        string[] channels
    }

    ESCALATION_RULES {
        uuid id PK
        uuid companyId FK
        string severity
        int escalateAfterDays
        string escalateToRole
    }

    ALERTS {
        uuid id PK
        string vin
        uuid companyId FK
        uuid defectId FK
        string severity
        string status
        uuid assignedToUserId FK
        string assignedToRole
        string assignedToDepartment
        string assignedToTeam
        uuid createdById FK
        int escalationStep
        timestamp nextEscalationAt
    }

    RESOLUTIONS {
        uuid id PK
        uuid alertId FK
        uuid resolvedByUserId FK
        timestamp resolvedAt
        string reason
        string notes
        string audioPath
        string transcription
        string[] imageUrls
    }

    DEFECT_RESOLUTION_TIMELINE {
        uuid id PK
        uuid alertId FK
        string actionType
        uuid performedByUserId FK
        string performedByRole
        string details
        timestamp createdAt
    }
```

---

## 3. Centralized Alert Engine Design

All external systems integrate through a central ingestion webhook/REST layer. The Alert Engine coordinates priority mapping, notifications, assignment, and escalation configurations.

### 3.1 Event Lifecycle Sequence Diagram
```mermaid
sequenceDiagram
    autonumber
    participant ExSystem as External Systems (Vision, Voice, etc.)
    participant Ingestion as Ingestion Gateway (NestJS REST/Webhook)
    participant AlertEng as Alert Engine Module
    participant Queue as BullMQ (Jobs Processor)
    participant DB as PostgreSQL (Prisma)
    participant RTGate as Real-time Gateway (Socket.IO)
    participant Notification as Notification Module

    ExSystem->>Ingestion: POST /api/v1/events (defect details, VIN, company_id)
    Ingestion->>Ingestion: Authenticate ApiKey & Validate Payload
    Ingestion->>AlertEng: Trigger Event Processing
    
    AlertEng->>DB: Fetch Company Settings & Defect Master Config
    DB-->>AlertEng: Defect Metadata (Severity, soundProfile, defaultAssigneeRole)
    
    AlertEng->>DB: Create Alert Entry & Initialize Defect Timeline
    DB-->>AlertEng: Saved Alert Object

    AlertEng->>Queue: Enqueue "ALERT_CREATED" job (Payload + Recipients)
    Note over Queue: BullMQ schedules instant worker task & sets delayed escalation tasks
    
    Queue->>Notification: Execute Notification dispatch rules (Email, SMS, Push)
    Notification->>RTGate: Push Real-Time event to company channel
    RTGate->>RTGate: Broadcast Socket.io event (room: company_{id})
    Notification-->>Notification: Dispatch FCM Push Notifications & Emails
```

---

## 4. Escalation Engine Architecture

Escalations must occur automatically without relying on user action. The system uses a scheduler mechanism to compute SLA times and process overdue assignments.

### 4.1 Chronological Workflow and SLAs
Every time an alert is created or reassigned, the `nextEscalationAt` timestamp is updated based on `EscalationRules` defined in the database for the company.
* **BullMQ Scheduler**: Runs a recurring cron job every minute.
* **Query Optimization**: Finds all `Alerts` where `status != RESOLVED` and `nextEscalationAt <= NOW()`.
* **Escalation Step Execution**:
  1. Determine next escalation tier (e.g. Day 0 -> Worker, Day 3 -> Supervisor, Day 7 -> Manager).
  2. Write to `EscalationHistory` and `DefectResolutionTimeline`.
  3. Reassign `assignedToRole` to the escalated role.
  4. Recalculate next escalation timestamp.
  5. Publish real-time events to supervisors/managers.
  6. Enqueue notifications (SMS, Emails, and Priority Push).

---

## 5. Notification & Real-Time Sync Structure

To avoid blocking request-response threads, all notifications are processed out-of-band by **BullMQ** using **Redis** backend.

### 5.1 Real-Time Sync Flow
1. **WebSockets Channels (Socket.IO)**:
   - Client authenticates with JWT and joins a specific room matching their company: `company_{companyId}`.
   - Separate supervisor and admin roles join additional sub-rooms: `company_{companyId}_management` to receive escalation alerts.
2. **Redis Adapter**:
   - Multiple NestJS backend instances coordinate websocket events using the Redis Pub/Sub adapter. This allows the system to scale horizontally behind a load balancer.

### 5.2 Sound Profile Distribution
To ensure Google Play Compliance and provide immediate visual/audio urgency:
* High/Critical/Emergency alerts deliver a specific payload metadata field: `sound_profile` (e.g., `siren`, `alarm`).
* The Android client reads this metadata and routes the notification to a pre-defined **Android Notification Channel** mapped to that sound.
* Under Google Play regulations, users must be allowed to configure these channels individually within the Android settings panel (mute, vibrate, choose sound).

---

## 6. Security and Tenant Isolation Design

### 6.1 Logical Data Isolation
- **Tenant Context Interceptor**: A NestJS Interceptor extracts the `companyId` from the JWT token and binds it to the request context (`Request.user.companyId`).
- **Prisma Middlewares / Custom Repository**: All queries implicitly inject the `companyId` constraint. E.g.:
  ```typescript
  prisma.alert.findMany({ where: { companyId: req.user.companyId } });
  ```
- **Primary Database Indices**: Tables including `Alert`, `User`, `DefectMaster`, `Notification` have a composite index starting with `companyId` to optimize read performance and enforce isolation.

### 6.2 Role-Based Access Control (RBAC)
Custom Decorators `@Roles(...)` verify user access levels.
* **Super Admin**: Full platform access (Manage companies, overall telemetry).
* **Company Admin**: Company-wide rules, settings, sound config, user onboarding.
* **Factory Manager / Supervisor**: Reassignment, resolving, adding notes, viewing reports.
* **Worker**: Reviewing assigned defects, adding audio comments, resolving own alerts.

---

## 7. Production Scaling and Deployment Strategy

### 7.1 Database Scaling (PostgreSQL)
* **Read-Write Splitting**: Route queries to Read Replicas (for dashboards and timelines) and write transactions to the Primary Master.
* **Table Partitioning**: Partition the `alerts`, `defect_resolution_timeline`, and `notifications` tables by `companyId` or by date ranges (e.g., monthly partitions) to ensure indexes remain in RAM.

### 7.2 Cache Strategy (Redis)
* Cache static elements: `DefectMaster` and `CompanySettings` definitions are cached with a TTL.
* When configurations are updated by the Company Admin, the cache key is invalidated.

### 7.3 Infrastructure Topology (Docker & Kubernetes)
* Deploy backend pods in a Kubernetes cluster using HPA (Horizontal Pod Autoscaler) targeting CPU/Memory usage.
* Separate pod pools:
  - **HTTP API Pods**: Serving REST webhooks and dashboard clients.
  - **WebSocket Gateway Pods**: High connection limits, sticky sessions enabled.
  - **Queue Worker Pods**: Running BullMQ consumer loops without exposing ports.
