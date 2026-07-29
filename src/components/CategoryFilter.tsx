import { useFilters } from '../context/FiltersContext'
import { useMeta } from '../context/MetaContext'

function CategoryFilter() {
  const { categories } = useMeta()
  const { filters, toggleCategory } = useFilters()

  return (
    <div className="category-filter">
      <span className="category-filter-label">Categories</span>
      <div
        className="category-filter-buttons"
        role="group"
        aria-label="Categories"
      >
        {categories.map((category) => {
          const isSelected = filters.categories.includes(category)
          return (
            <button
              key={category}
              type="button"
              aria-pressed={isSelected}
              className={
                isSelected
                  ? 'category-filter-button category-filter-button-active'
                  : 'category-filter-button'
              }
              onClick={() => toggleCategory(category)}
            >
              {category}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default CategoryFilter
