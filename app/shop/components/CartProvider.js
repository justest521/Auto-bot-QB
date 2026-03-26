'use client';

import { createContext, useContext, useState, useEffect } from 'react';

// Create Cart Context
const CartContext = createContext();

// Cart Context Provider Component
export function CartProvider({ children }) {
  const [items, setItems] = useState([]);
  const [isHydrated, setIsHydrated] = useState(false);

  // Initialize from localStorage on mount (client-side only)
  useEffect(() => {
    const savedCart = localStorage.getItem('quickbuy-cart');
    if (savedCart) {
      try {
        setItems(JSON.parse(savedCart));
      } catch (e) {
        console.error('Failed to parse cart from localStorage:', e);
        setItems([]);
      }
    }
    setIsHydrated(true);
  }, []);

  // Persist cart to localStorage whenever items change
  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem('quickbuy-cart', JSON.stringify(items));
    }
  }, [items, isHydrated]);

  // Add item to cart (supports both addItem and addToCart naming)
  const addItem = (product, quantity = 1) => {
    setItems((prevItems) => {
      const existingItem = prevItems.find((item) => item.id === product.id);

      if (existingItem) {
        // If item already in cart, increase quantity
        return prevItems.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      } else {
        // Add new item with quantity
        return [
          ...prevItems,
          {
            ...product,
            quantity,
            addedAt: new Date().toISOString(),
          },
        ];
      }
    });
  };

  // Alias for compatibility
  const addToCart = addItem;

  // Remove item from cart (supports both removeItem and removeFromCart naming)
  const removeItem = (productId) => {
    setItems((prevItems) => prevItems.filter((item) => item.id !== productId));
  };

  // Alias for compatibility
  const removeFromCart = removeItem;

  // Update item quantity
  const updateQuantity = (productId, quantity) => {
    if (quantity <= 0) {
      removeItem(productId);
      return;
    }

    setItems((prevItems) =>
      prevItems.map((item) =>
        item.id === productId ? { ...item, quantity } : item
      )
    );
  };

  // Clear entire cart
  const clearCart = () => {
    setItems([]);
  };

  // Calculate total items count
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

  // Calculate total price (supports both price and tw_retail_price)
  const totalPrice = items.reduce((sum, item) => {
    const price = item.tw_retail_price || item.price || 0;
    return sum + price * item.quantity;
  }, 0);

  // Format price for display
  const formattedTotalPrice = totalPrice.toFixed(2);

  // Helper for getting cart total
  const getCartTotal = () => totalPrice;

  // Helper for getting item count
  const getCartItemCount = () => totalItems;

  const value = {
    items,
    cart: items, // Alias for compatibility
    addItem,
    addToCart, // Alias for compatibility
    removeItem,
    removeFromCart, // Alias for compatibility
    updateQuantity,
    clearCart,
    totalItems,
    totalPrice,
    formattedTotalPrice,
    getCartTotal, // Alias for compatibility
    getCartItemCount, // Alias for compatibility
  };

  // Don't render until hydrated to avoid hydration mismatch
  if (!isHydrated) {
    return children;
  }

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}

// Default cart value for SSR / prerendering (no CartProvider available)
const defaultCartValue = {
  items: [], cart: [],
  addItem: () => {}, addToCart: () => {},
  removeItem: () => {}, removeFromCart: () => {},
  updateQuantity: () => {}, clearCart: () => {},
  totalItems: 0, totalPrice: 0, formattedTotalPrice: '0.00',
  getCartTotal: () => 0, getCartItemCount: () => 0,
};

// Custom hook to use cart context
export function useCart() {
  const context = useContext(CartContext);
  // Return default during SSR prerendering instead of throwing
  return context || defaultCartValue;
}
