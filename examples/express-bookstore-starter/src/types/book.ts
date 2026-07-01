export interface Book {
  id: string;
  title: string;
  author: string;
  isbn?: string;
  createdAt: string;
  updatedAt: string;
}

export type CreateBookInput = Omit<Book, 'id' | 'createdAt' | 'updatedAt'>;
