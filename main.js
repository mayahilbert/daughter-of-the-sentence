document.addEventListener("DOMContentLoaded", () => {

    gsap.registerPlugin(SplitText);
    const lenis = new Lenis({
        infinite: true,
        syncTouch: true
    });
// Add before your ScatterCursorEffect initialization
(function() {
    const consoleDiv = document.createElement('div');
    consoleDiv.id = 'mobile-console';
    consoleDiv.style.cssText = `
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        max-height: 200px;
        overflow-y: auto;
        background: rgba(0,0,0,0.9);
        color: #0f0;
        font-family: monospace;
        font-size: 10px;
        padding: 10px;
        z-index: 999999;
        border-top: 2px solid #0f0;
    `;
    document.body.appendChild(consoleDiv);

    const oldLog = console.log;
    const oldError = console.error;
    const oldWarn = console.warn;

    function addLog(msg, type = 'log') {
        const color = type === 'error' ? '#f00' : type === 'warn' ? '#ff0' : '#0f0';
        const line = document.createElement('div');
        line.style.color = color;
        line.textContent = `[${type.toUpperCase()}] ${msg}`;
        consoleDiv.appendChild(line);
        consoleDiv.scrollTop = consoleDiv.scrollHeight;
    }

    console.log = function(...args) {
        oldLog.apply(console, args);
        addLog(args.join(' '), 'log');
    };
    console.error = function(...args) {
        oldError.apply(console, args);
        addLog(args.join(' '), 'error');
    };
    console.warn = function(...args) {
        oldWarn.apply(console, args);
        addLog(args.join(' '), 'warn');
    };

    window.onerror = function(msg, url, line, col, error) {
        addLog(`ERROR: ${msg} at ${line}:${col}`, 'error');
    };
})();
    class ScatterCursorEffect {
        constructor(cssSelectors, imageSelectors = [], options = {}) {
            this.mouse = { x: 0, y: 0 };
            this.textContainers = [];
            this.imageElements = [];
            this.cursor = document.querySelector('.cursor');

            this.config = {
                influenceRadius: 300,
                maxDisplacement: 200,
                maxRotation: 50,
                gsapDuration: 2,
                gsapEasing: "power2.out",
                boundaries: { enabled: true, margin: 0 },
                elementConfig: {},
                imageConfig: {
                    influenceRadius: 350,
                    maxDisplacement: 150,
                    maxRotation: 30,
                    gsapDuration: 1.8,
                    gsapEasing: "power2.out",
                    boundaries: { enabled: true, margin: 10 }
                },
                ...options
            };

            this.init(cssSelectors);
            this.initImages(imageSelectors);
            this.bindEvents();
        }

        // Initialize text elements and split into chars
        init(cssSelectors) {
            let elements = [];
            if (typeof cssSelectors === "string") {
                elements = Array.from(document.querySelectorAll(cssSelectors));
            }
            else if (Array.isArray(cssSelectors)) {
                cssSelectors.forEach(sel => {
                    if (typeof sel === "string") {
                        elements.push(...document.querySelectorAll(sel));
                    }
                    else if (sel instanceof Element) {
                        elements.push(sel);
                    }
                });
            } else if (cssSelectors instanceof Element) {
                elements = [cssSelectors];
            }
            else if (cssSelectors instanceof NodeList || cssSelectors instanceof HTMLCollection) {
                elements = Array.from(cssSelectors);
            }

            elements.forEach((el, idx) => {
                // Manual text splitting (replacing SplitText for better iOS compatibility)
            const originalText = el.textContent;
            el.innerHTML = originalText.split('').map(char => {
                // Preserve spaces
                const displayChar = char === ' ' ? '&nbsp;' : char;
                return `<span class="char" style="display:inline-block;position:relative;will-change:transform;">${displayChar}</span>`;
            }).join('');
            
            const characters = Array.from(el.querySelectorAll('.char'));
            
            const container = {
                element: el,
                splitInstance: null,
                characters: characters,
                containerIndex: idx,
                bounds: null
            };

                container.characters.forEach(char => {
                    const rect = char.getBoundingClientRect();
                    char._origin = {
                        x: rect.left + window.pageXOffset + rect.width / 2,
                        y: rect.top + window.pageYOffset + rect.height / 2
                    };
                    char._width = rect.width;
                    char._height = rect.height;
                    char._permanent = { x: 0, y: 0, rotation: 0 };
                });

                this.updateContainerBounds(container);
                this.textContainers.push(container);
            });
        }

        // Initialize image elements
        initImages(imageSelectors) {
            let imageElements = [];

            if (typeof imageSelectors === "string") {
                imageElements = Array.from(document.querySelectorAll(imageSelectors));
            }
            else if (Array.isArray(imageSelectors)) {
                imageSelectors.forEach(sel => {
                    if (typeof sel === "string") {
                        imageElements.push(...document.querySelectorAll(sel));
                    }
                    else if (sel instanceof Element) {
                        imageElements.push(sel);
                    }
                });
            } else if (imageSelectors instanceof Element) {
                imageElements = [imageSelectors];
            }
            else if (imageSelectors instanceof NodeList || imageSelectors instanceof HTMLCollection) {
                imageElements = Array.from(imageSelectors);
            }

            imageElements.forEach((img, idx) => {
                // Store the original position before any transforms
                const computedStyle = window.getComputedStyle(img);
                const rect = img.getBoundingClientRect();

                // Make sure the image is positioned relatively or absolutely to maintain its place
                if (computedStyle.position === 'static') {
                    gsap.set(img, { position: 'relative' });
                }

                img._origin = {
                    x: rect.left + window.pageXOffset + rect.width / 2,
                    y: rect.top + window.pageYOffset + rect.height / 2
                };
                img._width = rect.width;
                img._height = rect.height;
                img._permanent = { x: 0, y: 0, rotation: 0 };
                img._imageIndex = idx;

                // Set transform origin for better rotation
                gsap.set(img, { transformOrigin: "center center" });

                this.imageElements.push(img);
            });
        }

        // Update container boundaries
        updateContainerBounds(container) {
            const rect = container.element.getBoundingClientRect();
            container.bounds = {
                left: rect.left + window.pageXOffset,
                right: rect.right + window.pageXOffset,
                top: rect.top + window.pageYOffset,
                bottom: rect.bottom + window.pageYOffset
            };
        }

        getElementConfig(idx) {
            const cfg = this.config.elementConfig[idx] || {};
            return {
                influenceRadius: cfg.influenceRadius || this.config.influenceRadius,
                maxDisplacement: cfg.maxDisplacement || this.config.maxDisplacement,
                maxRotation: cfg.maxRotation || this.config.maxRotation,
                gsapDuration: cfg.gsapDuration || this.config.gsapDuration,
                gsapEasing: cfg.gsapEasing || this.config.gsapEasing,
                boundaries: cfg.boundaries || this.config.boundaries
            };
        }

        getImageConfig(idx) {
            const cfg = this.config.imageConfig;
            return {
                influenceRadius: cfg.influenceRadius,
                maxDisplacement: cfg.maxDisplacement,
                maxRotation: cfg.maxRotation,
                gsapDuration: cfg.gsapDuration,
                gsapEasing: cfg.gsapEasing,
                boundaries: cfg.boundaries
            };
        }

        bindEvents() {
            document.querySelectorAll(".home-title-wrapper").forEach(homeTitle => {
                homeTitle.addEventListener("click", e => {
                    console.log("click large")
                    homeTitle.classList.toggle('expanded');
                })
            });

            document.addEventListener("mousemove", e => {
                this.mouse.x = e.clientX + window.pageXOffset;
                this.mouse.y = e.clientY + window.pageYOffset;

                if (this.cursor) {
                    gsap.to(this.cursor, {
                        x: e.clientX - 10,
                        y: e.clientY - 10,
                        duration: 0.3,
                        ease: "power2.out"
                    });
                }

                this.updateLetters();
                this.updateImages();
            });

            let lastScrollX = window.pageXOffset;
            let lastScrollY = window.pageYOffset;

            window.addEventListener("scroll", () => {
                const dx = window.pageXOffset - lastScrollX;
                const dy = window.pageYOffset - lastScrollY;

                // Adjust the stored mouse position by how much the page moved
                this.mouse.x += dx;
                this.mouse.y += dy;

                lastScrollX = window.pageXOffset;
                lastScrollY = window.pageYOffset;

                // Update character origins
                this.textContainers.forEach(container => {
                    this.updateContainerBounds(container);
                    container.characters.forEach(char => {
                        const rect = char.getBoundingClientRect();
                        char._origin = {
                            x: rect.left + window.pageXOffset + rect.width / 2,
                            y: rect.top + window.pageYOffset + rect.height / 2
                        };
                    });
                });

                // Update image origins
                this.imageElements.forEach(img => {
                    const rect = img.getBoundingClientRect();
                    img._origin = {
                        x: rect.left + window.pageXOffset + rect.width / 2,
                        y: rect.top + window.pageYOffset + rect.height / 2
                    };
                });

                // Trigger displacement calc with updated mouse + origins
                this.updateLetters();
                this.updateImages();
            });

            window.addEventListener("resize", () => {
                this.textContainers.forEach(container => this.updateContainerBounds(container));

                // Update image origins on resize
                this.imageElements.forEach(img => {
                    const rect = img.getBoundingClientRect();
                    img._origin = {
                        x: rect.left + window.pageXOffset + rect.width / 2,
                        y: rect.top + window.pageYOffset + rect.height / 2
                    };
                    img._width = rect.width;
                    img._height = rect.height;
                });
            });
        }

        updateLetters() {
            this.textContainers.forEach(container => {
                const cfg = this.getElementConfig(container.containerIndex);
                const bounds = container.bounds;

                container.characters.forEach(char => {
                    if (!char._origin) { return; }

                    // Compute influence
                    const dx = this.mouse.x - char._origin.x;
                    const dy = this.mouse.y - char._origin.y;
                    const dist = Math.hypot(dx, dy);
                    let influence = Math.max(0, 1 - dist / cfg.influenceRadius);

                    // apply a small but safe threshold
                    if (influence < 0.02) { influence = 0; }

                    const eased = 1 - Math.pow(1 - influence, 6);

                    // Compute target displacement directly
                    const tx = Math.cos(Math.atan2(dy, dx) + Math.PI) * eased * cfg.maxDisplacement;
                    const ty = Math.sin(Math.atan2(dy, dx) + Math.PI) * eased * cfg.maxDisplacement;

                    // Update _permanent only if influence > 0
                    if (influence > 0) {
                        char._permanent.x = tx;
                        char._permanent.y = ty;
                        char._permanent.rotation = Math.sin(Math.atan2(dy, dx)) * eased * cfg.maxRotation;
                    }

                    // Clamp to container
                    if (cfg.boundaries.enabled && bounds) {
                        const hw = char._width / 2;
                        const hh = char._height / 2;
                        const left = bounds.left + hw - char._origin.x;
                        const right = bounds.right - hw - char._origin.x;
                        const top = bounds.top + hh - char._origin.y;
                        const bottom = bounds.bottom - hh - char._origin.y;

                        char._permanent.x = Math.max(left, Math.min(char._permanent.x, right));
                        char._permanent.y = Math.max(top, Math.min(char._permanent.y, bottom));
                    }

                    // Apply GSAP tween
                    gsap.to(char, {
                        x: char._permanent.x,
                        y: char._permanent.y,
                        rotation: char._permanent.rotation,
                        duration: cfg.gsapDuration,
                        ease: cfg.gsapEasing,
                        overwrite: "auto"
                    });
                });
            });
        }

        updateImages() {
            this.imageElements.forEach(img => {
                if (!img._origin) { return; }

                const cfg = this.getImageConfig(img._imageIndex);

                // Compute influence
                const dx = this.mouse.x - img._origin.x;
                const dy = this.mouse.y - img._origin.y;
                const dist = Math.hypot(dx, dy);
                let influence = Math.max(0, 1 - dist / cfg.influenceRadius);

                // Apply threshold
                if (influence < 0.02) { influence = 0; }

                const eased = 1 - Math.pow(1 - influence, 4); // Slightly different easing for images

                // Compute target displacement
                const tx = Math.cos(Math.atan2(dy, dx) + Math.PI) * eased * cfg.maxDisplacement;
                const ty = Math.sin(Math.atan2(dy, dx) + Math.PI) * eased * cfg.maxDisplacement;

                // Update permanent values
                if (influence > 0) {
                    img._permanent.x = tx;
                    img._permanent.y = ty;
                    img._permanent.rotation = Math.sin(Math.atan2(dy, dx)) * eased * cfg.maxRotation;
                }

                // Apply boundaries if enabled (relative to original position)
                if (cfg.boundaries.enabled) {
                    const margin = cfg.boundaries.margin;

                    // Get the parent container bounds if available
                    const parent = img.parentElement;
                    const parentRect = parent.getBoundingClientRect();
                    const imgRect = img.getBoundingClientRect();

                    // Calculate boundaries relative to the image's container
                    const maxX = (parentRect.right - parentRect.left) - img._width / 2 - margin;
                    const maxY = (parentRect.bottom - parentRect.top) - img._height / 2 - margin;
                    const minX = -(img._width / 2) + margin;
                    const minY = -(img._height / 2) + margin;

                    // Clamp displacement to stay within reasonable bounds of original position
                    const maxDisplacement = cfg.maxDisplacement;
                    img._permanent.x = Math.max(-maxDisplacement, Math.min(img._permanent.x, maxDisplacement));
                    img._permanent.y = Math.max(-maxDisplacement, Math.min(img._permanent.y, maxDisplacement));
                }

                // Apply GSAP tween
                gsap.to(img, {
                    x: img._permanent.x,
                    y: img._permanent.y,
                    rotation: img._permanent.rotation,
                    duration: cfg.gsapDuration,
                    ease: cfg.gsapEasing,
                    overwrite: "auto"
                });
            });
        }

        createEntranceAnimation() {
            const tl = gsap.timeline();

            // Animate text characters in
            if (this.textContainers.length > 0) {
                tl.to(this.textContainers[0].characters, {
                    opacity: 1,
                    duration: 0.8,
                    stagger: {
                        each: 0.2,
                        from: "random"
                    },
                    delay: 0.2
                });
            }

            // Animate images in
            if (this.imageElements.length > 0) {
                tl.to(this.imageElements, {
                    opacity: 1,
                    scale: 1,
                    duration: 1,
                    stagger: {
                        each: 0.15,
                        from: "random"
                    },
                    ease: "back.out(1.7)"
                }, "-=0.4"); // Start 0.4s before text animation ends
            }

            return tl;
        }

        // Method to add new images dynamically
        addImages(imageSelectors) {
            this.initImages(imageSelectors);
        }

        // Method to add new text elements dynamically
        addText(cssSelectors) {
            this.init(cssSelectors);
        }
    }

    // Initialize with both text and images
    window.addEventListener("load", () => {
        const effect = new ScatterCursorEffect(
            ".split-text",                    // Text selectors
            ".floating",  // Image selectors
            {
                // Global config
                influenceRadius: 300,
                maxDisplacement: 200,
                maxRotation: 50,

                // Image-specific config
                imageConfig: {
                    influenceRadius: 160,
                    maxDisplacement: 70,
                    maxRotation: 10,
                    gsapDuration: 2,
                    gsapEasing: "power2.out",
                    boundaries: { enabled: true, margin: 100 }
                }
            }
        );

    });
    // End scattered letters effect
window.addEventListener("load", () => {
    console.log('Page loaded, initializing effect...');
    
    try {
        const effect = new ScatterCursorEffect(
            ".split-text",
            ".scatter-image, .floating-img",
            { /* your config */ }
        );
        
        console.log('Effect initialized');
        console.log('Text containers:', effect.textContainers.length);
        console.log('Image elements:', effect.imageElements.length);
        
        // Check first text container
        if (effect.textContainers.length > 0) {
            const first = effect.textContainers[0];
            console.log('First container chars:', first.characters.length);
            console.log('First char:', first.characters[0]);
            console.log('First char visible?', 
                window.getComputedStyle(first.characters[0]).opacity,
                window.getComputedStyle(first.characters[0]).display
            );
        }
        
        // Make effect available globally for manual testing
        window.debugEffect = effect;
        
    } catch(e) {
        console.error('Error initializing:', e.message);
        console.error('Stack:', e.stack);
    }
});
    // Start infinite scroll loop

    // repeat first three items by cloning them and appending them to the .grid
    const repeatItems = (parentEl, total = 5) => {
        const items = [...parentEl.children];
        for (let i = 0; i <= total - 1; ++i) {
            var cln = items[i].cloneNode(true);
            parentEl.appendChild(cln);
        }
    };

    function raf(time) {
        lenis.raf(time);
        requestAnimationFrame(raf);
    }

    imagesLoaded(document.querySelectorAll('.grid__item'), { background: true }, () => {

        repeatItems(document.querySelector('.grid'), 1);

        requestAnimationFrame(raf);

        const refresh = () => {
            window.history.scrollRestoration = 'manual';
        }

        refresh();
        window.addEventListener('resize', refresh);
    });

    //End infinite scroll loop

    //Start overlay

    const dialogs = document.querySelectorAll("dialog");

    function openDialog(dialog) {
        console.log("open dialog")
        document.querySelector("#homepage").classList.add('overlay-open');
        lenis.stop();
        setTimeout(function () {
            dialog.showModal();
            history.pushState({ dialogId: dialog.id }, ""); // store which dialog is open
        }, 1000);
    }

    function closeDialog(dialog) {
        dialog.close();
        console.log("close dialog")

        document.querySelector("#homepage").classList.remove('overlay-open');

        lenis.start();


    }

    document.getElementById("minders-open").addEventListener("click", () => {
        console.log("clicked minders")
        openDialog(document.getElementById("minders-overlay"));
    });
    document.getElementById("usage-open").addEventListener("click", () => {
        console.log("clicked usage")
        openDialog(document.getElementById("usage-overlay"));
    });
    document.getElementById("cling-open").addEventListener("click", () => {
        console.log("clicked cling")
        openDialog(document.getElementById("cling-overlay"));
    });
    document.getElementById("dos-open").addEventListener("click", () => {
        console.log("clicked dos")
        openDialog(document.getElementById("dos-overlay"));
    });

    // Close buttons
    let closeBtns = document.querySelectorAll(".close-btn")

    closeBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
            closeDialog(btn.closest("dialog"));
        });
    });
    // Handle back/forward navigation
    window.addEventListener("popstate", (event) => {
        const openStates = Array.from(dialogs).filter(d => d.open);

        if (event.state && event.state.dialogId) {
            const dlg = document.getElementById(event.state.dialogId);
            if (!dlg.open) dlg.showModal();
        } else if (openStates.length) {
            openStates[openStates.length - 1].close();
        }
    });
    //End overlay

    //Scatter images
    // Customize these values
    const imageUrls = [
        'images/gnaw/Sullivan_Blueprint1.jpg',
        'images/gnaw/Sullivan_Blueprint2.jpg',
        'images/gnaw/Sullivan_Blueprint3.jpg',
        'images/gnaw/Sullivan_Blueprint4.jpg',
        'images/gnaw/Sullivan_Blueprint5.jpg',
        'images/gnaw/Sullivan_Blueprint6.jpg',
        'images/gnaw/Sullivan_Blueprint7.jpg',
        'images/gnaw/Sullivan_Blueprint8.jpg',
    ];

    // Create images and scatter them
    const gnawContainer = document.getElementById('gnaw-container');
    for (let i = 0; i < imageUrls.length; i++) {
        const imgDiv = document.createElement('div');
        imgDiv.className = 'floating';
        const img = document.createElement('img');
        img.className = 'floating-img';

        img.src = imageUrls[i % imageUrls.length];
        imgDiv.appendChild(img);
        gnawContainer.appendChild(imgDiv);

        // Random position
        imgDiv.style.left = `${Math.random() * (window.innerWidth - 400)}px`;
        imgDiv.style.top = `${Math.random() * (gnawContainer.getBoundingClientRect().height)}px`;
        img.addEventListener("click", () => {
            document.getElementById("gnaw-main").setAttribute('src', img.getAttribute('src'));
        })
    }

});


