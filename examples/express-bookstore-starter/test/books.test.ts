import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/index';
import { _books } from '../src/routes/books';

const app = createApp();

describe('Bookstore API', () => {
  beforeEach(() => {
    // Reset to seed state for each test
    // (In a real app, you'd use a test database)
  });

  describe('GET /health', () => {
    it('should return ok status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'ok');
      expect(res.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /books', () => {
    it('should return list of books', async () => {
      const res = await request(app).get('/books');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('books');
      expect(res.body).toHaveProperty('total');
      expect(Array.isArray(res.body.books)).toBe(true);
      expect(res.body.total).toBeGreaterThanOrEqual(2);
    });
  });

  describe('GET /books/:id', () => {
    it('should return a single book', async () => {
      const res = await request(app).get('/books/book-1');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', 'book-1');
      expect(res.body).toHaveProperty('title');
      expect(res.body).toHaveProperty('author');
    });

    it('should return 404 for non-existent book', async () => {
      const res = await request(app).get('/books/non-existent');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Book not found');
    });
  });

  describe('POST /books', () => {
    it('should create a new book', async () => {
      const res = await request(app)
        .post('/books')
        .send({ title: 'New Book', author: 'Test Author' });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('title', 'New Book');
      expect(res.body).toHaveProperty('author', 'Test Author');
    });

    it('should reject missing title', async () => {
      const res = await request(app)
        .post('/books')
        .send({ author: 'Test Author' });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should reject missing author', async () => {
      const res = await request(app)
        .post('/books')
        .send({ title: 'New Book' });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('PUT /books/:id', () => {
    it('should update a book', async () => {
      const res = await request(app)
        .put('/books/book-1')
        .send({ title: 'Updated Title' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('title', 'Updated Title');
    });

    it('should return 404 for non-existent book', async () => {
      const res = await request(app)
        .put('/books/non-existent')
        .send({ title: 'X' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /books/:id', () => {
    it('should delete a book', async () => {
      // First create one
      const createRes = await request(app)
        .post('/books')
        .send({ title: 'To Delete', author: 'Author' });
      const id = createRes.body.id;

      const res = await request(app).delete(`/books/${id}`);
      expect(res.status).toBe(204);

      // Verify it's gone
      const getRes = await request(app).get(`/books/${id}`);
      expect(getRes.status).toBe(404);
    });
  });
});
