const { createApp, ref, reactive, onMounted, onUnmounted } = Vue;


createApp({
    setup() {
        const data = {
            pages: [
                {
                    id: "home",
                    label: "Home"
                },
                {
                    id: "about",
                    label: "About"
                },
                {
                    id: "contact",
                    label: "Contact"
                }
            ],
            cards: [
                {
                    title: "Automate Web Tasks",
                    body: "Build agents that can navigate websites, extract data, and complete workflows automatically."
                },
                {
                    title: "State-of-the-Art APIs",
                    body: "Integrate powerful web automation into your apps with simple, flexible APIs."
                },
                {
                    title: "Scalable Infrastructure",
                    body: "Run thousands of intelligent agents reliably with cloud-based orchestration."
                }
            ],
            team: [
                {
                    initial: "AC",
                    name: "Alex Carter",
                    role: "Founder & CEO",
                    color: "#548687"
                },
                {
                    initial: "CM",
                    name: "Maya Chen",
                    role: "CTO",
                    color: "#C49A1C"
                },
                {
                    initial: "LN",
                    name: "Liam Novak",
                    role: "CFO",
                    color: "#B43C2F"
                }
            ],
            slides: [
                {
                    title: "Build Intelligent Agents",
                    body: "Create agents that understand and interact with the web in real time.",
                    color: "#71bbec"
                },
                {
                    title: "Automate Complex Workflows",
                    body: "From scraping to task execution, let agents handle repetitive processes.",
                    color: "#c783e2"
                },
                {
                    title: "Integrate Anywhere",
                    body: "Connect AnyAI with your tools and systems in no time.",
                    color: "#ffa04d"
                },
                {
                    title: "Scale Effortlessly",
                    body: "Deploy and manage agents at scale with reliable infrastructure.",
                    color: "#5eda91"
                },
            ]
        };

        const current = ref("home");

        const slideIndex = ref(0);

        let sliderInterval;

        const refreshSliderInterval = () => {
            clearInterval(sliderInterval);

            sliderInterval = setInterval(nextSlide, 3000);
        };

        refreshSliderInterval();

        onMounted(() => refreshSliderInterval);
        onUnmounted(() => clearInterval(sliderInterval));

        function nextSlide() {
            refreshSliderInterval();

            slideIndex.value = (slideIndex.value + 1) % data.slides.length;
        }

        function prevSlide() {
            refreshSliderInterval();

            slideIndex.value = (slideIndex.value - 1 + data.slides.length) % data.slides.length;
        }

        const form = reactive({
            name: "",
            email: "",
            message: ""
        });

        function handleSubmit() {
            alert("Thanks! Your message has been sent.");

            form.name = "";
            form.email = "";
            form.message = "";
        }

        return {
            data,
            current,
            slideIndex,
            form,
            nextSlide,
            prevSlide,
            handleSubmit
        };
    }
})
    .mount("#app");