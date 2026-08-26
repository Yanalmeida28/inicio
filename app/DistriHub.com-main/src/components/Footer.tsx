export function Footer() {
  return (
    <footer className="footer" id="sobre">
      <div className="page-container footer-inner">
        <div>
          <a className="brand-logo footer-logo" href="#inicio">
            <span className="brand-mark">
              <span />
              <span />
            </span>
            <span>
              Distri<span>Hub</span>
            </span>
          </a>
          <p>
            Distribuição que entende
            <br />o ritmo da sua assistência.
          </p>
        </div>
        <div className="footer-links">
          <div>
            <b>Comprar</b>
            <a href="#catalogo">Catálogo</a>
            <a href="#catalogo">Ofertas</a>
            <a href="#como-funciona">Como comprar</a>
          </div>
          <div id="ajuda">
            <b>Atendimento</b>
            <a href="#ajuda">Central de ajuda</a>
            <a href="#ajuda">Fale conosco</a>
            <a href="#ajuda">WhatsApp</a>
          </div>
          <div>
            <b>Horários</b>
            <span>Seg a Sex</span>
            <span>08h às 18h</span>
            <span>Sáb 08h às 12h</span>
          </div>
        </div>
      </div>
      <div className="page-container footer-bottom">
        <span>© 2024 DistriHub. Todos os direitos reservados.</span>
        <span>Feito para fazer seu negócio crescer.</span>
      </div>
    </footer>
  );
}
