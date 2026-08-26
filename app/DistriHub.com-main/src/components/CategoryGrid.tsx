import {
  ArrowRight,
  BatteryCharging,
  Cable,
  ChevronRight,
  Headphones,
  Smartphone,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { categories } from '../data';

const iconMap: Record<string, LucideIcon> = {
  Smartphone,
  BatteryCharging,
  Cable,
  Zap,
  Wrench,
  Headphones,
};

type CategoryGridProps = {
  selectedCategory: string;
  onCategorySelect: (category: string) => void;
  onClear: () => void;
};

export function CategoryGrid({
  selectedCategory,
  onCategorySelect,
  onClear,
}: CategoryGridProps) {
  return (
    <section className="category-section" id="catalogo">
      <div className="page-container">
        <div className="section-heading">
          <div>
            <span className="section-kicker">Encontre rápido</span>
            <h2>O que você precisa hoje?</h2>
          </div>
          <a
            href="#catalogo"
            onClick={(e) => {
              e.preventDefault();
              onClear();
            }}
          >
            Ver tudo <ArrowRight size={16} />
          </a>
        </div>
        <div className="category-grid">
          {categories.map(({ label, icon, tone }) => {
            const Icon = iconMap[icon] ?? Smartphone;
            return (
              <button
                key={label}
                className={`category-card tone-${tone} ${
                  selectedCategory === label ? 'selected' : ''
                }`}
                onClick={() =>
                  onCategorySelect(selectedCategory === label ? '' : label)
                }
              >
                <span className="category-icon">
                  <Icon size={22} />
                </span>
                <span>{label}</span>
                <ChevronRight size={15} className="category-arrow" />
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
