import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './entities/category.entity';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
  ) {}

  findAll(): Promise<Category[]> {
    return this.categoryRepository.find({ order: { name: 'ASC' } });
  }

  async findBySlug(slug: string): Promise<Category | null> {
    return this.categoryRepository.findOne({ where: { slug } });
  }

  async findById(id: string): Promise<Category | null> {
    return this.categoryRepository.findOne({ where: { id } });
  }
}
