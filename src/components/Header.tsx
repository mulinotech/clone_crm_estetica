import { useState, useEffect } from "react";
import { Menu, X, Phone, Calendar, Heart, Shield } from "lucide-react";

interface HeaderProps {
  onNavigate: (sectionId: string) => void;
  activeSection: string;
  onOpenDashboard: () => void;
}

export default function Header({ onNavigate, activeSection, onOpenDashboard }: HeaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 50) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navItems = [
    { id: "inicio", label: "Início" },
    { id: "tratamentos", label: "Procedimentos" },
    { id: "corpo-clinico", label: "Corpo Clínico" },
    { id: "resultados", label: "Resultados" },
    { id: "quiz", label: "Avaliação 3D" },
    { id: "contato", label: "Contato" },
  ];

  const handleLinkClick = (id: string) => {
    setIsOpen(false);
    onNavigate(id);
  };

  return (
    <header
      id="main-header"
      className={`fixed top-0 left-0 w-full z-50 transition-all duration-300 ${
        isScrolled
          ? "bg-luxury-black/95 backdrop-blur-md py-4 border-b border-primary/10 shadow-sm"
          : "bg-gradient-to-b from-luxury-black/80 to-transparent py-6"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Logo Brand */}
          <div 
            className="flex flex-col cursor-pointer group"
            onClick={() => handleLinkClick("inicio")}
          >
            <span className="text-xl sm:text-2xl font-serif tracking-[0.2em] text-neutral font-semibold transition-colors duration-300 group-hover:text-primary">
              CRM
            </span>
            <span className="text-[9px] tracking-[0.35em] text-primary uppercase font-medium mt-0.5">
              Estética SaaS
            </span>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-8">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleLinkClick(item.id)}
                className={`text-xs uppercase tracking-widest font-medium transition-all duration-300 hover:text-primary relative py-1 cursor-pointer ${
                  activeSection === item.id 
                    ? "text-primary" 
                    : "text-neutral-muted"
                }`}
              >
                {item.label}
                {activeSection === item.id && (
                  <span className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary to-transparent" />
                )}
              </button>
            ))}
          </nav>

          {/* Call to Actions */}
          <div className="hidden sm:flex items-center space-x-4">
            <button
              onClick={onOpenDashboard}
              className="text-[10px] uppercase tracking-widest font-medium text-neutral-muted hover:text-primary border border-secondary hover:border-primary/50 px-2.5 py-1.5 rounded transition-all duration-300 cursor-pointer"
              title="Acessar Área Restrita do CRM"
            >
              Login CRM
            </button>
            <a
              href={`https://wa.me/5511999999999?text=${encodeURIComponent("Olá! Gostaria de agendar uma consulta de avaliação personalizada.")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 text-xs uppercase tracking-widest font-semibold text-white bg-primary px-5 py-2.5 rounded-sm hover:bg-primary-light transition-all duration-300 shadow-sm transform hover:-translate-y-0.5 cursor-pointer"
            >
              <Calendar className="w-4 h-4" />
              <span>Agendar Agora</span>
            </a>
          </div>

          {/* Mobile Menu Trigger */}
          <div className="flex items-center lg:hidden space-x-3">
            <button
              onClick={onOpenDashboard}
              className="text-[9px] uppercase tracking-wider text-neutral-muted border border-secondary px-2 py-1 rounded cursor-pointer"
            >
              Login CRM
            </button>
            <button
              id="mobile-menu-btn"
              onClick={() => setIsOpen(!isOpen)}
              className="p-1 text-neutral hover:text-primary transition-colors cursor-pointer"
              aria-label="Toggle menu"
            >
              {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Panel */}
      {isOpen && (
        <div className="lg:hidden absolute top-full left-0 w-full bg-luxury-dark/95 backdrop-blur-lg border-b border-primary/10 py-6 px-4 animate-in fade-in slide-in-from-top-5 duration-200">
          <nav className="flex flex-col space-y-4">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleLinkClick(item.id)}
                className={`text-left text-sm uppercase tracking-widest font-medium py-2 border-b border-secondary/25 transition-all cursor-pointer ${
                  activeSection === item.id ? "text-primary pl-2" : "text-neutral-muted"
                }`}
              >
                {item.label}
              </button>
            ))}
            <a
              href={`https://wa.me/5511999999999?text=${encodeURIComponent("Olá! Gostaria de agendar uma consulta de avaliação personalizada.")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center space-x-2 text-xs uppercase tracking-widest font-semibold text-white bg-primary py-3.5 rounded-sm shadow-sm mt-4 cursor-pointer"
            >
              <Calendar className="w-4.5 h-4.5" />
              <span>Agendar Avaliação</span>
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}
