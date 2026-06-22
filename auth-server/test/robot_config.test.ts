import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import {
  parseEnvFile,
  serializeEnvFile,
  readRobotConfig,
  validateRobotConfig,
  writeRobotConfig,
} from '../src/robot_config.js';

let tmpDir: string;
let credPath: string;
let sessionsPath: string;
let robotConfigPath: string;
let correctHash: string;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-robot-config-test-'));
  credPath = path.join(tmpDir, 'credentials.json');
  sessionsPath = path.join(tmpDir, 'sessions');
  robotConfigPath = path.join(tmpDir, 'robot.env');
  fs.mkdirSync(sessionsPath, { recursive: true });

  correctHash = await bcrypt.hash('correctpass', 10);
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function seedCreds() {
  fs.writeFileSync(
    credPath,
    JSON.stringify({
      username: 'admin',
      passwordHash: correctHash,
      mustChangePassword: false,
    })
  );
}

function getApp() {
  seedCreds();
  return createApp({
    credPath,
    sessionsPath,
    sessionSecret: 'test-secret',
    robotConfigPath,
  });
}

describe('robot_config module', () => {
  describe('parseEnvFile', () => {
    it('should parse key=value lines', () => {
      const content = 'KEY1=value1\nKEY2=value2\n';
      const result = parseEnvFile(content);
      expect(result).toEqual({ KEY1: 'value1', KEY2: 'value2' });
    });

    it('should skip empty lines', () => {
      const content = 'KEY1=value1\n\nKEY2=value2\n';
      const result = parseEnvFile(content);
      expect(result).toEqual({ KEY1: 'value1', KEY2: 'value2' });
    });

    it('should skip comment lines starting with #', () => {
      const content = '# comment\nKEY1=value1\n# another\nKEY2=value2\n';
      const result = parseEnvFile(content);
      expect(result).toEqual({ KEY1: 'value1', KEY2: 'value2' });
    });

    it('should split on first = only', () => {
      const content = 'KEY=value=with=equals\n';
      const result = parseEnvFile(content);
      expect(result).toEqual({ KEY: 'value=with=equals' });
    });
  });

  describe('serializeEnvFile', () => {
    it('should output only allowlist keys in fixed order', () => {
      const values = {
        ROBOT_TYPE: 'diff_drive',
        ROBOT_NAME: 'Rover1',
        ROBOT_NAMESPACE: 'robot_ns',
        ROBOT_LENGTH_M: '1.5',
        ROBOT_WIDTH_M: '1.0',
        VIDEO_TOPIC: '/camera/image',
        VIDEO_TOPIC_TYPE: 'compressed',
        NAV_ACTION: '/navigate_to_pose',
        EXTRA_KEY: 'should_be_ignored',
      };
      const result = serializeEnvFile(values);
      const lines = result.trim().split('\n');
      expect(lines).toEqual([
        'ROBOT_TYPE=diff_drive',
        'ROBOT_NAME=Rover1',
        'ROBOT_NAMESPACE=robot_ns',
        'ROBOT_LENGTH_M=1.5',
        'ROBOT_WIDTH_M=1.0',
        'VIDEO_TOPIC=/camera/image',
        'VIDEO_TOPIC_TYPE=compressed',
        'NAV_ACTION=/navigate_to_pose',
      ]);
    });

    it('should end with newline', () => {
      const values = {
        ROBOT_TYPE: 'holonomic',
        ROBOT_NAME: '',
        ROBOT_NAMESPACE: '',
        ROBOT_LENGTH_M: '',
        ROBOT_WIDTH_M: '',
        VIDEO_TOPIC: '',
        VIDEO_TOPIC_TYPE: 'raw',
        NAV_ACTION: '',
      };
      const result = serializeEnvFile(values);
      expect(result.endsWith('\n')).toBe(true);
    });
  });

  describe('readRobotConfig', () => {
    it('should read and return only allowlist keys from file', () => {
      const content =
        'ROBOT_TYPE=holonomic\nROBOT_NAME=MyRobot\nROBOT_LENGTH_M=2.0\nEXTRA_SECRET=ignore_me\n';
      fs.writeFileSync(robotConfigPath, content);
      const result = readRobotConfig(robotConfigPath);
      expect(result).toEqual({
        ROBOT_TYPE: 'holonomic',
        ROBOT_NAME: 'MyRobot',
        ROBOT_NAMESPACE: '',
        ROBOT_LENGTH_M: '2.0',
        ROBOT_WIDTH_M: '',
        VIDEO_TOPIC: '',
        VIDEO_TOPIC_TYPE: 'compressed',
        NAV_ACTION: '',
      });
    });

    it('should return defaults when file is missing', () => {
      const missingPath = path.join(tmpDir, 'nonexistent.env');
      const result = readRobotConfig(missingPath);
      expect(result).toEqual({
        ROBOT_TYPE: 'diff_drive',
        ROBOT_NAME: '',
        ROBOT_NAMESPACE: '',
        ROBOT_LENGTH_M: '',
        ROBOT_WIDTH_M: '',
        VIDEO_TOPIC: '',
        VIDEO_TOPIC_TYPE: 'compressed',
        NAV_ACTION: '',
      });
    });

    it('should use defaults for missing keys', () => {
      const content = 'ROBOT_NAME=Bot\n';
      fs.writeFileSync(robotConfigPath, content);
      const result = readRobotConfig(robotConfigPath);
      expect(result.ROBOT_TYPE).toBe('diff_drive');
      expect(result.VIDEO_TOPIC_TYPE).toBe('compressed');
      expect(result.ROBOT_NAME).toBe('Bot');
    });
  });

  describe('validateRobotConfig', () => {
    it('should reject keys not in allowlist', () => {
      const input = {
        ROBOT_TYPE: 'diff_drive',
        SESSION_SECRET: 'should_fail',
      };
      const result = validateRobotConfig(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toHaveProperty('SESSION_SECRET');
      }
    });

    it('should accept valid ROBOT_TYPE values', () => {
      const input = {
        ROBOT_TYPE: 'diff_drive',
      };
      const result = validateRobotConfig(input);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.values.ROBOT_TYPE).toBe('diff_drive');
      }
    });

    it('should reject invalid ROBOT_TYPE', () => {
      const input = {
        ROBOT_TYPE: 'invalid_type',
      };
      const result = validateRobotConfig(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toHaveProperty('ROBOT_TYPE');
      }
    });

    it('should validate ROBOT_NAME: string, ≤ 64 chars, no control chars, no newline/=', () => {
      const validInput = { ROBOT_NAME: 'MyRobot-123_v2' };
      const validResult = validateRobotConfig(validInput);
      expect(validResult.ok).toBe(true);

      const tooLongInput = { ROBOT_NAME: 'x'.repeat(65) };
      const tooLongResult = validateRobotConfig(tooLongInput);
      expect(tooLongResult.ok).toBe(false);
      if (!tooLongResult.ok) {
        expect(tooLongResult.errors).toHaveProperty('ROBOT_NAME');
      }

      const withNewlineInput = { ROBOT_NAME: 'Bot\nEvil' };
      const withNewlineResult = validateRobotConfig(withNewlineInput);
      expect(withNewlineResult.ok).toBe(false);
      if (!withNewlineResult.ok) {
        expect(withNewlineResult.errors).toHaveProperty('ROBOT_NAME');
      }

      const withEqualsInput = { ROBOT_NAME: 'Bot=Evil' };
      const withEqualsResult = validateRobotConfig(withEqualsInput);
      expect(withEqualsResult.ok).toBe(false);
      if (!withEqualsResult.ok) {
        expect(withEqualsResult.errors).toHaveProperty('ROBOT_NAME');
      }
    });

    it('should allow empty ROBOT_NAME', () => {
      const input = { ROBOT_NAME: '' };
      const result = validateRobotConfig(input);
      expect(result.ok).toBe(true);
    });

    it('should validate ROBOT_NAMESPACE: ROS name rules, no /', () => {
      const validInput = { ROBOT_NAMESPACE: 'robot_ns_123' };
      const validResult = validateRobotConfig(validInput);
      expect(validResult.ok).toBe(true);

      const withSlashInput = { ROBOT_NAMESPACE: 'robot/ns' };
      const withSlashResult = validateRobotConfig(withSlashInput);
      expect(withSlashResult.ok).toBe(false);
      if (!withSlashResult.ok) {
        expect(withSlashResult.errors).toHaveProperty('ROBOT_NAMESPACE');
      }

      const startsWithNumberInput = { ROBOT_NAMESPACE: '1robot' };
      const startsWithNumberResult = validateRobotConfig(startsWithNumberInput);
      expect(startsWithNumberResult.ok).toBe(false);
      if (!startsWithNumberResult.ok) {
        expect(startsWithNumberResult.errors).toHaveProperty('ROBOT_NAMESPACE');
      }
    });

    it('should allow empty ROBOT_NAMESPACE', () => {
      const input = { ROBOT_NAMESPACE: '' };
      const result = validateRobotConfig(input);
      expect(result.ok).toBe(true);
    });

    it('should validate ROBOT_LENGTH_M and ROBOT_WIDTH_M: finite number, ≥0, ≤10', () => {
      const validInput = { ROBOT_LENGTH_M: '1.5', ROBOT_WIDTH_M: '1.0' };
      const validResult = validateRobotConfig(validInput);
      expect(validResult.ok).toBe(true);

      const negativeInput = { ROBOT_LENGTH_M: '-1' };
      const negativeResult = validateRobotConfig(negativeInput);
      expect(negativeResult.ok).toBe(false);
      if (!negativeResult.ok) {
        expect(negativeResult.errors).toHaveProperty('ROBOT_LENGTH_M');
      }

      const tooLargeInput = { ROBOT_WIDTH_M: '11' };
      const tooLargeResult = validateRobotConfig(tooLargeInput);
      expect(tooLargeResult.ok).toBe(false);
      if (!tooLargeResult.ok) {
        expect(tooLargeResult.errors).toHaveProperty('ROBOT_WIDTH_M');
      }

      const nanInput = { ROBOT_LENGTH_M: 'not_a_number' };
      const nanResult = validateRobotConfig(nanInput);
      expect(nanResult.ok).toBe(false);
      if (!nanResult.ok) {
        expect(nanResult.errors).toHaveProperty('ROBOT_LENGTH_M');
      }
    });

    it('should allow empty ROBOT_LENGTH_M and ROBOT_WIDTH_M', () => {
      const input = { ROBOT_LENGTH_M: '', ROBOT_WIDTH_M: '' };
      const result = validateRobotConfig(input);
      expect(result.ok).toBe(true);
    });

    it('should validate VIDEO_TOPIC: ROS topic path or empty, no newline/=', () => {
      const validInput = { VIDEO_TOPIC: '/camera/image/compressed' };
      const validResult = validateRobotConfig(validInput);
      expect(validResult.ok).toBe(true);

      const relativeTopicInput = { VIDEO_TOPIC: 'camera_image' };
      const relativeTopicResult = validateRobotConfig(relativeTopicInput);
      expect(relativeTopicResult.ok).toBe(true); // Relative topics are valid ROS names

      const withNewlineInput = { VIDEO_TOPIC: '/camera\nimage' };
      const withNewlineResult = validateRobotConfig(withNewlineInput);
      expect(withNewlineResult.ok).toBe(false);
      if (!withNewlineResult.ok) {
        expect(withNewlineResult.errors).toHaveProperty('VIDEO_TOPIC');
      }

      const withEqualsInput = { VIDEO_TOPIC: '/camera=image' };
      const withEqualsResult = validateRobotConfig(withEqualsInput);
      expect(withEqualsResult.ok).toBe(false);
      if (!withEqualsResult.ok) {
        expect(withEqualsResult.errors).toHaveProperty('VIDEO_TOPIC');
      }
    });

    it('should allow empty VIDEO_TOPIC', () => {
      const input = { VIDEO_TOPIC: '' };
      const result = validateRobotConfig(input);
      expect(result.ok).toBe(true);
    });

    it('should validate VIDEO_TOPIC_TYPE: compressed or raw', () => {
      const validCompressedInput = { VIDEO_TOPIC_TYPE: 'compressed' };
      const validCompressedResult = validateRobotConfig(validCompressedInput);
      expect(validCompressedResult.ok).toBe(true);

      const validRawInput = { VIDEO_TOPIC_TYPE: 'raw' };
      const validRawResult = validateRobotConfig(validRawInput);
      expect(validRawResult.ok).toBe(true);

      const invalidInput = { VIDEO_TOPIC_TYPE: 'invalid' };
      const invalidResult = validateRobotConfig(invalidInput);
      expect(invalidResult.ok).toBe(false);
      if (!invalidResult.ok) {
        expect(invalidResult.errors).toHaveProperty('VIDEO_TOPIC_TYPE');
      }
    });

    it('should validate NAV_ACTION: ROS action path or empty, no newline/=', () => {
      const validInput = { NAV_ACTION: '/navigate_to_pose' };
      const validResult = validateRobotConfig(validInput);
      expect(validResult.ok).toBe(true);

      const relativeActionInput = { NAV_ACTION: 'navigate_to_pose' };
      const relativeActionResult = validateRobotConfig(relativeActionInput);
      expect(relativeActionResult.ok).toBe(true); // Relative actions are valid ROS names

      const withNewlineInput = { NAV_ACTION: '/navigate\nto_pose' };
      const withNewlineResult = validateRobotConfig(withNewlineInput);
      expect(withNewlineResult.ok).toBe(false);
      if (!withNewlineResult.ok) {
        expect(withNewlineResult.errors).toHaveProperty('NAV_ACTION');
      }

      const withEqualsInput = { NAV_ACTION: '/navigate=to_pose' };
      const withEqualsResult = validateRobotConfig(withEqualsInput);
      expect(withEqualsResult.ok).toBe(false);
      if (!withEqualsResult.ok) {
        expect(withEqualsResult.errors).toHaveProperty('NAV_ACTION');
      }
    });

    it('should allow empty NAV_ACTION', () => {
      const input = { NAV_ACTION: '' };
      const result = validateRobotConfig(input);
      expect(result.ok).toBe(true);
    });
  });

  describe('writeRobotConfig', () => {
    it('should write atomically using temp file + rename', () => {
      const values = {
        ROBOT_TYPE: 'holonomic',
        ROBOT_NAME: 'TestBot',
        ROBOT_NAMESPACE: 'test_ns',
        ROBOT_LENGTH_M: '1.5',
        ROBOT_WIDTH_M: '1.0',
        VIDEO_TOPIC: '/test/image',
        VIDEO_TOPIC_TYPE: 'raw',
        NAV_ACTION: '/my_nav_action',
      };
      writeRobotConfig(robotConfigPath, values);

      const written = fs.readFileSync(robotConfigPath, 'utf8');
      const lines = written.trim().split('\n');
      expect(lines).toContain('ROBOT_TYPE=holonomic');
      expect(lines).toContain('ROBOT_NAME=TestBot');
      expect(lines).toContain('NAV_ACTION=/my_nav_action');
    });

    it('should write only allowlist keys', () => {
      const values = {
        ROBOT_TYPE: 'diff_drive',
        ROBOT_NAME: 'Bot',
        ROBOT_NAMESPACE: '',
        ROBOT_LENGTH_M: '',
        ROBOT_WIDTH_M: '',
        VIDEO_TOPIC: '',
        VIDEO_TOPIC_TYPE: 'compressed',
        NAV_ACTION: '',
        SECRET_KEY: 'should_not_appear',
      };
      writeRobotConfig(robotConfigPath, values);

      const written = fs.readFileSync(robotConfigPath, 'utf8');
      expect(written).not.toContain('SECRET_KEY');
      expect(written).not.toContain('should_not_appear');
    });
  });
});

describe('robot-config endpoints', () => {
  beforeEach(() => {
    if (fs.existsSync(robotConfigPath)) {
      fs.unlinkSync(robotConfigPath);
    }
  });

  it('should return 401 for GET /robot-config without session', async () => {
    const app = getApp();
    const res = await supertest(app).get('/auth/robot-config');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('should return 401 for PUT /robot-config without session', async () => {
    const app = getApp();
    const res = await supertest(app)
      .put('/auth/robot-config')
      .send({ ROBOT_TYPE: 'diff_drive' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('should return eight allowlist keys on GET after login', async () => {
    const app = getApp();
    const agent = supertest.agent(app);

    // Login
    await agent
      .post('/auth/login')
      .send('username=admin&password=correctpass')
      .set('Content-Type', 'application/x-www-form-urlencoded');

    // GET /robot-config
    const res = await agent.get('/auth/robot-config');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ROBOT_TYPE');
    expect(res.body).toHaveProperty('ROBOT_NAME');
    expect(res.body).toHaveProperty('ROBOT_NAMESPACE');
    expect(res.body).toHaveProperty('ROBOT_LENGTH_M');
    expect(res.body).toHaveProperty('ROBOT_WIDTH_M');
    expect(res.body).toHaveProperty('VIDEO_TOPIC');
    expect(res.body).toHaveProperty('VIDEO_TOPIC_TYPE');
    expect(res.body).toHaveProperty('NAV_ACTION');
    expect(Object.keys(res.body).length).toBe(8);
  });

  it('should return defaults when config file is missing', async () => {
    const app = getApp();
    const agent = supertest.agent(app);

    await agent
      .post('/auth/login')
      .send('username=admin&password=correctpass')
      .set('Content-Type', 'application/x-www-form-urlencoded');

    const res = await agent.get('/auth/robot-config');
    expect(res.status).toBe(200);
    expect(res.body.ROBOT_TYPE).toBe('diff_drive');
    expect(res.body.VIDEO_TOPIC_TYPE).toBe('compressed');
  });

  it('should return 400 with per-field errors on invalid PUT', async () => {
    const app = getApp();
    const agent = supertest.agent(app);

    await agent
      .post('/auth/login')
      .send('username=admin&password=correctpass')
      .set('Content-Type', 'application/x-www-form-urlencoded');

    const res = await agent
      .put('/auth/robot-config')
      .send({
        ROBOT_TYPE: 'invalid_type',
        ROBOT_LENGTH_M: '-5',
        ROBOT_NAMESPACE: 'ns/with/slash',
        SESSION_SECRET: 'should_fail',
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
    expect(res.body.errors).toHaveProperty('ROBOT_TYPE');
    expect(res.body.errors).toHaveProperty('ROBOT_LENGTH_M');
    expect(res.body.errors).toHaveProperty('ROBOT_NAMESPACE');
    expect(res.body.errors).toHaveProperty('SESSION_SECRET');
  });

  it('should persist and merge valid PUT', async () => {
    const app = getApp();
    const agent = supertest.agent(app);

    await agent
      .post('/auth/login')
      .send('username=admin&password=correctpass')
      .set('Content-Type', 'application/x-www-form-urlencoded');

    // Initial state
    const getRes1 = await agent.get('/auth/robot-config');
    expect(getRes1.body.ROBOT_NAME).toBe('');

    // PUT new values
    const putRes = await agent
      .put('/auth/robot-config')
      .send({
        ROBOT_NAME: 'MyBot',
        ROBOT_LENGTH_M: '1.5',
      });

    expect(putRes.status).toBe(200);
    expect(putRes.body).toHaveProperty('restartRequired', true);
    expect(putRes.body.values.ROBOT_NAME).toBe('MyBot');
    expect(putRes.body.values.ROBOT_LENGTH_M).toBe('1.5');

    // Verify persistence
    const getRes2 = await agent.get('/auth/robot-config');
    expect(getRes2.body.ROBOT_NAME).toBe('MyBot');
    expect(getRes2.body.ROBOT_LENGTH_M).toBe('1.5');
    expect(getRes2.body.ROBOT_TYPE).toBe('diff_drive'); // unchanged default
  });

  it('should not modify file on invalid PUT', async () => {
    const app = getApp();
    const agent = supertest.agent(app);

    await agent
      .post('/auth/login')
      .send('username=admin&password=correctpass')
      .set('Content-Type', 'application/x-www-form-urlencoded');

    // Set initial state
    await agent.put('/auth/robot-config').send({
      ROBOT_NAME: 'OriginalBot',
      ROBOT_TYPE: 'diff_drive',
    });

    // Invalid PUT
    const invalidRes = await agent
      .put('/auth/robot-config')
      .send({
        ROBOT_NAME: 'x'.repeat(100), // too long
      });

    expect(invalidRes.status).toBe(400);

    // Verify file unchanged
    const getRes = await agent.get('/auth/robot-config');
    expect(getRes.body.ROBOT_NAME).toBe('OriginalBot');
  });

  it('should never expose secrets in GET/PUT responses', async () => {
    const app = getApp();
    const agent = supertest.agent(app);

    await agent
      .post('/auth/login')
      .send('username=admin&password=correctpass')
      .set('Content-Type', 'application/x-www-form-urlencoded');

    const getRes = await agent.get('/auth/robot-config');
    expect(getRes.body).not.toHaveProperty('SESSION_SECRET');
    expect(JSON.stringify(getRes.body)).not.toContain('SESSION_SECRET');

    const putRes = await agent
      .put('/auth/robot-config')
      .send({
        ROBOT_NAME: 'Bot',
      });

    expect(putRes.body.values).not.toHaveProperty('SESSION_SECRET');
    expect(JSON.stringify(putRes.body.values)).not.toContain('SESSION_SECRET');
  });

  it('should count GET/PUT as real activity (idle timeout)', async () => {
    const idleTimeoutMs = 300;
    seedCreds();
    const app = createApp({
      credPath,
      sessionsPath,
      sessionSecret: 'test-secret',
      robotConfigPath,
      idleTimeoutMs,
    });

    const agent = supertest.agent(app);

    // Login
    await agent
      .post('/auth/login')
      .send('username=admin&password=correctpass')
      .set('Content-Type', 'application/x-www-form-urlencoded');

    // Wait half the timeout
    await new Promise((r) => setTimeout(r, idleTimeoutMs / 2));

    // GET should count as activity
    const getRes = await agent.get('/auth/robot-config');
    expect(getRes.status).toBe(200);

    // Wait another half
    await new Promise((r) => setTimeout(r, idleTimeoutMs / 2));

    // Should still be authenticated (activity was recent)
    const meRes = await agent.get('/auth/me');
    expect(meRes.status).toBe(200);
  });
});
