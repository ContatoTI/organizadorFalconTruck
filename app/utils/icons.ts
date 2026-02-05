import { 
  Briefcase, Home, Coffee, Sun, Moon, Star, Heart, Book, Laptop, Smartphone, ShoppingCart, Zap,
  Folder, Calendar, Clock, CheckCircle
} from 'lucide-vue-next'

export const iconMap: Record<string, any> = {
  Folder, Briefcase, Home, Coffee, Sun, Moon, Star, Heart, Book, Laptop, Smartphone, ShoppingCart, Zap, Calendar, Clock, CheckCircle
}

export const getIconComponent = (iconName: string) => {
  return iconMap[iconName] || Folder
}
