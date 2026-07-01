import { Router, Request, Response } from 'express';
import { Book, CreateBookInput } from '../types/book';

// In-memory store (for demo purposes)
const books: Map<string, Book> = new Map();

// Seed some demo data
const seedData: Book[] = [
  {
    id: 'book-1',
    title: 'The Pragmatic Programmer',
    author: 'Andy Hunt and Dave Thomas',
    isbn: '978-0135957059',
    createdAt: new Date('2023-01-01').toISOString(),
    updatedAt: new Date('2023-01-01').toISOString(),
  },
  {
    id: 'book-2',
    title: 'Clean Code',
    author: 'Robert C. Martin',
    isbn: '978-0132350884',
    createdAt: new Date('2023-01-02').toISOString(),
    updatedAt: new Date('2023-01-02').toISOString(),
  },
];

for (const book of seedData) {
  books.set(book.id, book);
}

const router = Router();

// GET /books — list all books
router.get('/', (req: Request, res: Response) => {
  const allBooks = Array.from(books.values());
  res.json({ books: allBooks, total: allBooks.length });
});

// GET /books/:id — get a single book
router.get('/:id', (req: Request, res: Response) => {
  const book = books.get(req.params.id);
  if (!book) {
    res.status(404).json({ error: 'Book not found' });
    return;
  }
  res.json(book);
});

// POST /books — create a new book (currently unprotected — JWT auth needed)
router.post('/', (req: Request, res: Response) => {
  const { title, author, isbn } = req.body as CreateBookInput;

  if (!title || !author) {
    res.status(400).json({ error: 'title and author are required' });
    return;
  }

  const id = `book-${Date.now()}`;
  const now = new Date().toISOString();
  const book: Book = { id, title, author, isbn, createdAt: now, updatedAt: now };

  books.set(id, book);
  res.status(201).json(book);
});

// PUT /books/:id — update a book
router.put('/:id', (req: Request, res: Response) => {
  const existing = books.get(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Book not found' });
    return;
  }

  const { title, author, isbn } = req.body as Partial<CreateBookInput>;
  const updated: Book = {
    ...existing,
    title: title ?? existing.title,
    author: author ?? existing.author,
    isbn: isbn ?? existing.isbn,
    updatedAt: new Date().toISOString(),
  };

  books.set(existing.id, updated);
  res.json(updated);
});

// DELETE /books/:id — delete a book
router.delete('/:id', (req: Request, res: Response) => {
  if (!books.has(req.params.id)) {
    res.status(404).json({ error: 'Book not found' });
    return;
  }
  books.delete(req.params.id);
  res.status(204).send();
});

export const booksRouter = router;

// Export for testing
export const _books = books;
