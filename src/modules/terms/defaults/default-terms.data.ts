type DefaultTermsArticle = {
  number: string;
  heading: string;
  paragraphs: string[];
};

type DefaultTermsSectionVi = {
  title: string;
  articles: DefaultTermsArticle[];
};

export type DefaultTermsSection = {
  titleVi: string;
  titleEn: string;
  articlesVi: DefaultTermsArticle[];
  articlesEn: DefaultTermsArticle[];
};

const VI_TERMS_SECTIONS: DefaultTermsSectionVi[] = [
  {
    title: 'PHẦN I – GIỚI THIỆU – TƯ CÁCH PHÁP LÝ – PHẠM VI ÁP DỤNG – ĐỊNH NGHĨA',
    articles: [
      {
        number: '1',
        heading: 'Chủ thể cung cấp dịch vụ và tư cách pháp lý',
        paragraphs: [
          '1.1. OracleCloud Vietnam là đơn vị cung cấp dịch vụ điện toán đám mây, máy chủ ảo (VPS/VM) và dịch vụ quản lý hạ tầng (Managed Cloud Service) thông qua website chính thức tại địa chỉ https://oraclecloud.vn.',
          '1.2. OracleCloud Vietnam là đối tác chính thức được Oracle Corporation ủy quyền, thực hiện việc triển khai, cung cấp và quản lý dịch vụ Cloud dựa trên hạ tầng Oracle cho khách hàng tại Việt Nam theo phạm vi ủy quyền và các thỏa thuận hợp tác giữa hai bên.',
          '1.3. Mặc dù là đối tác được ủy quyền, OracleCloud Vietnam là bên trực tiếp cung cấp dịch vụ cho Người dùng, chịu trách nhiệm về: việc triển khai dịch vụ; vận hành, hỗ trợ kỹ thuật; quan hệ hợp đồng với Người dùng cuối.',
          '1.4. Oracle Corporation không phải là bên ký kết Điều khoản sử dụng này với Người dùng, không trực tiếp cung cấp dịch vụ cho Người dùng cuối và không chịu trách nhiệm pháp lý trực tiếp đối với các nghĩa vụ phát sinh giữa OracleCloud Vietnam và Người dùng, trừ khi có thỏa thuận riêng bằng văn bản.',
          '1.5. Việc sử dụng tên, thương hiệu và công nghệ Oracle trong phạm vi Điều khoản này được thực hiện theo quyền ủy quyền hợp pháp, không làm phát sinh quan hệ đại diện pháp lý toàn phần hoặc chuyển giao trách nhiệm giữa các bên.',
        ],
      },
      {
        number: '2',
        heading: 'Hiệu lực ràng buộc của Điều khoản',
        paragraphs: [
          '2.1. Điều khoản sử dụng này cấu thành một thỏa thuận dân sự – thương mại có giá trị pháp lý ràng buộc giữa OracleCloud Vietnam và Người dùng.',
          '2.2. Bằng việc truy cập website, đăng ký tài khoản, thanh toán phí dịch vụ, hoặc sử dụng bất kỳ dịch vụ nào, Người dùng được xem là đã đọc toàn bộ Điều khoản, hiểu rõ quyền, nghĩa vụ và rủi ro, đồng ý bị ràng buộc bởi Điều khoản này mà không có bất kỳ bảo lưu nào.',
          '2.3. Trường hợp Người dùng không đồng ý với bất kỳ nội dung nào của Điều khoản, Người dùng phải ngừng sử dụng dịch vụ ngay lập tức.',
        ],
      },
      {
        number: '3',
        heading: 'Phạm vi áp dụng',
        paragraphs: [
          '3.1. Điều khoản này áp dụng cho tất cả cá nhân, tổ chức trong và ngoài nước sử dụng dịch vụ tại oraclecloud.vn; chủ tài khoản chính và mọi người được cấp quyền truy cập; mọi hành vi phát sinh từ tài khoản Người dùng, kể cả khi phát sinh do bên thứ ba truy cập trái phép.',
          '3.2. Điều khoản này điều chỉnh toàn bộ việc đăng ký, sử dụng, thanh toán dịch vụ; việc cấp phát, quản lý tài nguyên; việc xử lý vi phạm và chấm dứt dịch vụ.',
          '3.3. Trong trường hợp có mâu thuẫn giữa Điều khoản này và các tài liệu, thông tin khác trên website, Điều khoản này có giá trị ưu tiên áp dụng cao nhất, trừ khi có thỏa thuận bằng văn bản khác.',
        ],
      },
      {
        number: '4',
        heading: 'Giải thích thuật ngữ',
        paragraphs: [
          '4.1. Dịch vụ: Là toàn bộ dịch vụ Cloud, VPS, VM, tài nguyên điện toán và dịch vụ quản lý hạ tầng do OracleCloud Vietnam cung cấp.',
          '4.2. Cloud / Cloud Computing: Là mô hình cung cấp tài nguyên điện toán theo nhu cầu thông qua hạ tầng máy chủ từ xa.',
          '4.3. Máy ảo (VPS/VM): Là máy chủ ảo được tạo lập trên nền tảng Cloud, được cấp tài nguyên theo gói dịch vụ mà Người dùng đăng ký.',
          '4.4. Managed Cloud Service: Là dịch vụ trong đó OracleCloud Vietnam thực hiện các hoạt động quản lý kỹ thuật như giám sát, hỗ trợ, vận hành hạ tầng ở mức nhất định.',
          '4.5. Người dùng: Là cá nhân hoặc tổ chức đăng ký và sử dụng dịch vụ, chịu trách nhiệm pháp lý đối với mọi hoạt động trên máy ảo.',
          '4.6. Tài nguyên: Bao gồm CPU, RAM, dung lượng lưu trữ, băng thông, địa chỉ IP và các tài nguyên liên quan khác.',
          '4.7. Mining (Đào tiền mã hóa): Là việc sử dụng tài nguyên máy ảo để khai thác tiền mã hóa. Hoạt động này chỉ được phép khi có kiểm soát và chấp thuận rõ ràng.',
        ],
      },
      {
        number: '5',
        heading: 'Nguyên tắc cung cấp dịch vụ',
        paragraphs: [
          '5.1. Dịch vụ được cung cấp theo mô hình thuê tài nguyên có thời hạn, không chuyển giao quyền sở hữu hạ tầng hoặc phần mềm nền tảng.',
          '5.2. OracleCloud Vietnam có quyền giám sát mức sử dụng tài nguyên, can thiệp kỹ thuật khi cần thiết, áp dụng biện pháp xử lý để đảm bảo an toàn hệ thống.',
          '5.3. Người dùng thừa nhận rằng Cloud là môi trường dùng chung; hiệu năng và khả năng sẵn sàng có thể thay đổi theo tải hệ thống; không tồn tại cam kết hoạt động tuyệt đối 100% nếu không có SLA riêng.',
        ],
      },
    ],
  },
  {
    title: 'PHẦN II – MÔ HÌNH DỊCH VỤ – PHẠM VI QUẢN LÝ – QUYỀN & GIỚI HẠN KỸ THUẬT',
    articles: [
      {
        number: '6',
        heading: 'Mô hình cung cấp dịch vụ Managed Oracle Cloud',
        paragraphs: [
          '6.1. OracleCloud Vietnam cung cấp dịch vụ theo mô hình Managed Oracle Cloud Service, trong đó hạ tầng Cloud được triển khai và vận hành trên nền tảng công nghệ Oracle; OracleCloud Vietnam là đối tác chính thức được Oracle Corporation ủy quyền, thực hiện việc triển khai, cung cấp, cấu hình, vận hành, hỗ trợ kỹ thuật và quản lý dịch vụ Cloud cho Người dùng cuối.',
          '6.2. Người dùng hiểu và đồng ý rằng OracleCloud Vietnam không sở hữu công nghệ lõi của Oracle và không có quyền sửa đổi, can thiệp hoặc thay đổi kiến trúc nền tảng Cloud cốt lõi do Oracle Corporation cung cấp.',
          '6.3. Mọi cam kết liên quan đến việc cung cấp dịch vụ cho Người dùng cuối, hỗ trợ kỹ thuật, vận hành, xử lý sự cố, quản lý tài nguyên và tương tác với Người dùng được OracleCloud Vietnam thực hiện trực tiếp trong phạm vi quyền hạn được Oracle Corporation ủy quyền.',
          '6.4. Người dùng xác nhận và đồng ý rằng Oracle Corporation không phải là bên ký kết hợp đồng hoặc Điều khoản sử dụng này với Người dùng; Oracle Corporation không chịu trách nhiệm pháp lý trực tiếp đối với các nghĩa vụ phát sinh giữa OracleCloud Vietnam và Người dùng cuối.',
        ],
      },
      {
        number: '7',
        heading: 'Phân định trách nhiệm giữa các bên',
        paragraphs: [
          '7.1. Trách nhiệm của OracleCloud Vietnam: Cấp phát máy ảo, tài nguyên theo gói dịch vụ đã đăng ký; quản lý kỹ thuật ở tầng hạ tầng và ảo hóa; giám sát hoạt động hệ thống ở mức cần thiết; hỗ trợ kỹ thuật theo phạm vi công bố.',
          '7.2. Trách nhiệm của Người dùng: Quản trị hệ điều hành, ứng dụng, dữ liệu trên máy ảo; cấu hình bảo mật ở tầng hệ điều hành và ứng dụng; đảm bảo việc sử dụng dịch vụ đúng pháp luật và Điều khoản.',
          '7.3. Oracle Corporation: Không tham gia trực tiếp vào việc cung cấp dịch vụ cho Người dùng; không chịu trách nhiệm về vận hành, dữ liệu, tranh chấp phát sinh; không bị ràng buộc bởi Điều khoản sử dụng này.',
        ],
      },
      {
        number: '8',
        heading: 'Phạm vi dịch vụ được cung cấp',
        paragraphs: [
          '8.1. Dịch vụ OracleCloud Vietnam cung cấp bao gồm nhưng không giới hạn: thuê máy chủ ảo (VPS/VM); cấp phát CPU, RAM, lưu trữ, băng thông; cung cấp địa chỉ IP; công cụ quản lý máy ảo; dịch vụ hỗ trợ kỹ thuật.',
          '8.2. Các dịch vụ bổ sung (Snapshot, Backup, Firewall, Giám sát nâng cao) chỉ có hiệu lực khi được công bố rõ ràng và có thể phát sinh chi phí riêng.',
          '8.3. OracleCloud Vietnam không cam kết rằng mọi dịch vụ bổ sung đều luôn sẵn sàng hoặc phù hợp với mọi cấu hình máy ảo.',
        ],
      },
      {
        number: '9',
        heading: 'Cơ chế cấp phát và sử dụng tài nguyên',
        paragraphs: [
          '9.1. Tài nguyên được cấp phát dựa trên gói dịch vụ mà Người dùng lựa chọn và khả năng sẵn có của hệ thống tại thời điểm cấp phát.',
          '9.2. Người dùng hiểu rằng tài nguyên Cloud là tài nguyên dùng chung; hiệu năng thực tế có thể biến động theo tải hệ thống; việc sử dụng tối đa tài nguyên trong thời gian dài có thể bị giám sát.',
          '9.3. OracleCloud Vietnam có quyền theo dõi mức tiêu thụ tài nguyên, cảnh báo hoặc giới hạn tài nguyên nếu phát hiện dấu hiệu bất thường, điều chỉnh tạm thời cấu hình để bảo vệ hệ thống chung.',
        ],
      },
      {
        number: '10',
        heading: 'Quyền quản trị của Người dùng',
        paragraphs: [
          '10.1. Người dùng được cấp quyền quản trị máy ảo trong phạm vi hệ điều hành, phần mềm/ứng dụng cài đặt trên máy ảo, và dữ liệu do Người dùng tạo ra.',
          '10.2. Người dùng không có quyền truy cập vào hạ tầng vật lý, can thiệp vào lớp ảo hóa, truy cập máy ảo của người dùng khác, hoặc thay đổi cấu hình nền tảng Cloud.',
          '10.3. Mọi hành vi vượt quá phạm vi quyền quản trị được cấp được xem là vi phạm Điều khoản.',
        ],
      },
      {
        number: '11',
        heading: 'Quyền can thiệp kỹ thuật của OracleCloud Vietnam',
        paragraphs: [
          '11.1. OracleCloud Vietnam có quyền can thiệp kỹ thuật vào máy ảo hoặc hệ thống trong các trường hợp: bảo trì định kỳ hoặc khẩn cấp; khắc phục sự cố kỹ thuật; ngăn chặn tấn công mạng; xử lý hành vi vi phạm Điều khoản; tuân thủ yêu cầu từ cơ quan có thẩm quyền.',
          '11.2. Hình thức can thiệp có thể bao gồm: giới hạn tài nguyên; tạm dừng máy ảo; khởi động lại hệ thống; cách ly máy ảo khỏi hệ thống chung; thu hồi quyền truy cập.',
          '11.3. Người dùng đồng ý rằng các biện pháp can thiệp này có thể được thực hiện không cần thông báo trước trong trường hợp khẩn cấp và không làm phát sinh nghĩa vụ bồi thường.',
        ],
      },
      {
        number: '12',
        heading: 'Giới hạn dịch vụ và rủi ro kỹ thuật',
        paragraphs: [
          '12.1. Người dùng hiểu và chấp nhận rằng dịch vụ Cloud có thể phát sinh lỗi kỹ thuật; không tồn tại hệ thống không có rủi ro; hiệu năng và tính sẵn sàng phụ thuộc vào nhiều yếu tố khách quan.',
          '12.2. OracleCloud Vietnam không bảo đảm dịch vụ hoạt động liên tục không gián đoạn; hiệu năng luôn đạt mức tối đa; không xảy ra lỗi phần cứng hoặc phần mềm.',
          '12.3. Trường hợp có SLA riêng, quyền và nghĩa vụ của các bên được điều chỉnh theo SLA đó, không thay thế Điều khoản này.',
        ],
      },
      {
        number: '13',
        heading: 'Quy định về mục đích sử dụng hợp lệ',
        paragraphs: [
          '13.1. Người dùng chỉ được sử dụng dịch vụ cho các mục đích hợp pháp, bao gồm nhưng không giới hạn: vận hành website, ứng dụng; phát triển, thử nghiệm phần mềm; lưu trữ và xử lý dữ liệu hợp pháp.',
          '13.2. Mọi mục đích sử dụng không được nêu rõ hoặc gây rủi ro cho hệ thống đều có thể bị từ chối hoặc chấm dứt dịch vụ.',
        ],
      },
      {
        number: '14',
        heading: 'Quy định về hoạt động đào tiền mã hóa (Mining)',
        paragraphs: [
          '14.1. Hoạt động Mining không được phép mặc định trên mọi gói dịch vụ.',
          '14.2. Chỉ được phép Mining khi có sự chấp thuận rõ ràng bằng văn bản hoặc cấu hình từ OracleCloud Vietnam; sử dụng gói dịch vụ phù hợp với mining; tuân thủ giới hạn tài nguyên và chính sách kiểm soát.',
          '14.3. OracleCloud Vietnam có quyền giám sát mức sử dụng tài nguyên liên quan đến mining; giới hạn hoặc dừng mining nếu ảnh hưởng hệ thống; chấm dứt dịch vụ ngay lập tức nếu mining trái phép.',
          '14.4. Mọi thiệt hại phát sinh từ hoạt động mining do Người dùng tự chịu trách nhiệm.',
        ],
      },
      {
        number: '15',
        heading: 'Không chuyển giao quyền sử dụng',
        paragraphs: [
          '15.1. Người dùng không được chuyển nhượng, cho thuê lại, chia sẻ quyền sử dụng dịch vụ cho bên thứ ba nếu không có sự chấp thuận bằng văn bản từ OracleCloud Vietnam.',
          '15.2. Mọi hành vi chuyển giao trái phép được xem là vi phạm nghiêm trọng Điều khoản.',
        ],
      },
    ],
  },
  {
    title: 'PHẦN III – NGHĨA VỤ NGƯỜI DÙNG – HÀNH VI BỊ CẤM – CƠ CHẾ XỬ LÝ VI PHẠM',
    articles: [
      {
        number: '16',
        heading: 'Nghĩa vụ pháp lý chung của Người dùng',
        paragraphs: [
          '16.1. Người dùng có nghĩa vụ sử dụng dịch vụ một cách hợp pháp, trung thực, thiện chí và tuân thủ đầy đủ Điều khoản sử dụng này, pháp luật Việt Nam, và pháp luật có liên quan tại nơi đặt hạ tầng.',
          '16.2. Người dùng chịu toàn bộ trách nhiệm pháp lý đối với mọi hoạt động phát sinh từ tài khoản; mọi dữ liệu, nội dung, phần mềm, ứng dụng được cài đặt trên máy ảo; mọi thiệt hại phát sinh cho bên thứ ba do hành vi sử dụng dịch vụ của mình.',
          '16.3. OracleCloud Vietnam không có nghĩa vụ kiểm duyệt trước nội dung hoặc hoạt động của Người dùng.',
        ],
      },
      {
        number: '17',
        heading: 'Nghĩa vụ quản lý tài khoản và truy cập',
        paragraphs: [
          '17.1. Người dùng có trách nhiệm bảo mật thông tin đăng nhập; quản lý mật khẩu, khóa SSH, API key; thiết lập phân quyền truy cập phù hợp.',
          '17.2. Mọi hành vi phát sinh từ tài khoản được mặc định là do Người dùng thực hiện, kể cả trong trường hợp tài khoản bị chiếm quyền hoặc bên thứ ba truy cập trái phép.',
          '17.3. OracleCloud Vietnam không chịu trách nhiệm đối với thiệt hại phát sinh do lộ thông tin đăng nhập, cấu hình bảo mật yếu, hoặc không cập nhật vá lỗi hệ thống.',
        ],
      },
      {
        number: '18',
        heading: 'Nghĩa vụ sử dụng tài nguyên đúng mục đích',
        paragraphs: [
          '18.1. Người dùng cam kết sử dụng tài nguyên đúng gói dịch vụ đã đăng ký, đúng mục đích hợp pháp, không gây ảnh hưởng tiêu cực đến hệ thống chung.',
          '18.2. Người dùng không được lạm dụng tài nguyên vượt mức cho phép; cố tình duy trì mức tải cao bất thường trong thời gian dài; lợi dụng lỗi hệ thống để chiếm dụng tài nguyên.',
        ],
      },
      {
        number: '19',
        heading: 'Các hành vi bị nghiêm cấm – Nhóm an ninh mạng',
        paragraphs: [
          '19.1. Nghiêm cấm sử dụng dịch vụ để thực hiện hoặc hỗ trợ các hành vi: tấn công từ chối dịch vụ (DDoS, DRDoS, Flood, Amplification); quét cổng, dò lỗ hổng trái phép; brute-force, credential stuffing; triển khai botnet, malware, trojan, ransomware; phát tán mã độc dưới mọi hình thức.',
          '19.2. Mọi hành vi có dấu hiệu đe dọa an toàn hệ thống được xem là vi phạm nghiêm trọng, có thể bị xử lý ngay lập tức.',
        ],
      },
      {
        number: '20',
        heading: 'Các hành vi bị nghiêm cấm – Nhóm spam & lạm dụng mạng',
        paragraphs: [
          '20.1. Nghiêm cấm gửi email spam, SMS spam; chạy proxy, open relay; vận hành VPN, TOR relay, node ẩn danh trái phép; lợi dụng máy ảo làm trung gian ẩn danh cho hành vi bất hợp pháp.',
          '20.2. OracleCloud Vietnam có quyền đánh giá hành vi spam/lạm dụng dựa trên phản ánh từ hệ thống, khiếu nại từ bên thứ ba, và dữ liệu giám sát kỹ thuật.',
        ],
      },
      {
        number: '21',
        heading: 'Các hành vi bị nghiêm cấm – Nội dung & dữ liệu',
        paragraphs: [
          '21.1. Nghiêm cấm lưu trữ, xử lý hoặc phát tán nội dung vi phạm pháp luật; nội dung xâm phạm quyền sở hữu trí tuệ; nội dung đồi trụy, bạo lực, phản động; nội dung xâm phạm đời sống riêng tư, danh dự cá nhân.',
          '21.2. Người dùng tự chịu trách nhiệm xác minh tính hợp pháp của dữ liệu mình lưu trữ.',
        ],
      },
      {
        number: '22',
        heading: 'Các hành vi bị nghiêm cấm – Tiền mã hóa & tài chính',
        paragraphs: [
          '22.1. Nghiêm cấm đào tiền mã hóa khi chưa được cho phép; đào coin vượt mức tài nguyên cho phép; che giấu hoặc ngụy trang hoạt động mining.',
          '22.2. Nghiêm cấm sử dụng dịch vụ cho lừa đảo tài chính; phát hành token trái phép; rửa tiền hoặc che giấu nguồn gốc tài sản.',
        ],
      },
      {
        number: '23',
        heading: 'Các hành vi bị nghiêm cấm – Lạm dụng hạ tầng',
        paragraphs: [
          '23.1. Nghiêm cấm can thiệp trái phép vào hạ tầng; gây ảnh hưởng đến máy ảo của Người dùng khác; tìm cách truy cập trái phép vào hệ thống quản trị.',
          '23.2. OracleCloud Vietnam có toàn quyền xác định hành vi lạm dụng dựa trên đánh giá kỹ thuật và rủi ro.',
        ],
      },
      {
        number: '24',
        heading: 'Nguyên tắc xác định và xử lý vi phạm',
        paragraphs: [
          '24.1. Việc xác định vi phạm được thực hiện dựa trên dữ liệu giám sát hệ thống; phản ánh từ đối tác, nhà cung cấp hạ tầng; yêu cầu từ cơ quan nhà nước có thẩm quyền.',
          '24.2. Người dùng đồng ý rằng đánh giá của OracleCloud Vietnam có giá trị quyết định và không bắt buộc phải có kết luận của cơ quan chức năng trước khi xử lý.',
        ],
      },
      {
        number: '25',
        heading: 'Các biện pháp xử lý vi phạm',
        paragraphs: [
          '25.1. Tùy mức độ vi phạm, OracleCloud Vietnam có quyền áp dụng một hoặc nhiều biện pháp sau mà không cần báo trước: cảnh báo; giới hạn tài nguyên; tạm ngưng máy ảo; khóa tài khoản; chấm dứt dịch vụ vĩnh viễn; xóa dữ liệu liên quan đến vi phạm.',
          '25.2. Trường hợp vi phạm nghiêm trọng: không hoàn tiền, không cung cấp lại dữ liệu, có thể phối hợp với cơ quan chức năng.',
        ],
      },
      {
        number: '26',
        heading: 'Miễn trừ nghĩa vụ thông báo',
        paragraphs: [
          '26.1. OracleCloud Vietnam không có nghĩa vụ thông báo trước trong các trường hợp vi phạm an ninh; rủi ro nghiêm trọng cho hệ thống; yêu cầu khẩn cấp từ cơ quan có thẩm quyền.',
          '26.2. Việc xử lý khẩn cấp không làm phát sinh trách nhiệm bồi thường.',
        ],
      },
      {
        number: '27',
        heading: 'Bồi thường thiệt hại',
        paragraphs: [
          '27.1. Người dùng có trách nhiệm bồi thường cho OracleCloud Vietnam đối với thiệt hại phát sinh do vi phạm Điều khoản; khiếu nại, tranh chấp từ bên thứ ba; chi phí pháp lý, chi phí xử lý sự cố.',
          '27.2. Nghĩa vụ bồi thường tồn tại kể cả sau khi dịch vụ đã chấm dứt.',
        ],
      },
    ],
  },
  {
    title: 'PHẦN IV – THANH TOÁN – GIA HẠN – KHÔNG HOÀN TIỀN – HẾT HẠN DỊCH VỤ – THU HỒI TÀI NGUYÊN',
    articles: [
      {
        number: '28',
        heading: 'Nguyên tắc thanh toán dịch vụ',
        paragraphs: [
          '28.1. Dịch vụ Cloud/VPS do OracleCloud Vietnam cung cấp được áp dụng theo nguyên tắc trả phí trước cho toàn bộ thời hạn sử dụng mà Người dùng lựa chọn.',
          '28.2. Việc thanh toán được thực hiện thông qua các phương thức được OracleCloud Vietnam công bố tại từng thời điểm và được xem là hoàn tất khi khoản tiền được ghi nhận thành công và dịch vụ được kích hoạt hoặc gia hạn trên hệ thống.',
          '28.3. Người dùng có trách nhiệm kiểm tra đầy đủ thông tin gói dịch vụ, cấu hình, thời hạn trước khi thanh toán; đảm bảo quyền và nghĩa vụ tài chính của mình phát sinh từ việc sử dụng dịch vụ.',
          '28.4. OracleCloud Vietnam không chịu trách nhiệm đối với các sai sót phát sinh do Người dùng lựa chọn nhầm gói dịch vụ, thời hạn hoặc cấu hình.',
        ],
      },
      {
        number: '29',
        heading: 'Giá dịch vụ và điều chỉnh giá',
        paragraphs: [
          '29.1. Giá dịch vụ được công bố công khai tại thời điểm Người dùng đăng ký hoặc gia hạn.',
          '29.2. OracleCloud Vietnam có quyền điều chỉnh giá dịch vụ; thay đổi cấu trúc gói dịch vụ; áp dụng chính sách giá mới theo từng thời kỳ.',
          '29.3. Việc điều chỉnh giá không ảnh hưởng đến thời hạn dịch vụ đã được thanh toán trước đó và được áp dụng cho các kỳ gia hạn hoặc đăng ký mới.',
        ],
      },
      {
        number: '30',
        heading: 'Gia hạn dịch vụ',
        paragraphs: [
          '30.1. Người dùng có trách nhiệm chủ động gia hạn dịch vụ trước khi hết hạn sử dụng.',
          '30.2. OracleCloud Vietnam không có nghĩa vụ nhắc nhở gia hạn hoặc gia hạn tự động nếu không có thỏa thuận riêng.',
          '30.3. Việc không gia hạn đúng hạn được xem là Người dùng tự nguyện chấm dứt quyền sử dụng dịch vụ khi hết hạn.',
        ],
      },
      {
        number: '31',
        heading: 'Chính sách hủy dịch vụ & KHÔNG HOÀN TIỀN',
        paragraphs: [
          '31.1. Người dùng có quyền yêu cầu hủy dịch vụ trước thời hạn sử dụng.',
          '31.2. Tuy nhiên, Người dùng xác nhận và đồng ý rõ ràng rằng MỌI KHOẢN PHÍ ĐÃ THANH TOÁN KHÔNG ĐƯỢC HOÀN LẠI; việc hủy dịch vụ trước hạn không làm phát sinh bất kỳ nghĩa vụ hoàn tiền nào từ phía OracleCloud Vietnam.',
          '31.3. Chính sách KHÔNG HOÀN TIỀN áp dụng cho mọi trường hợp: Người dùng không còn nhu cầu sử dụng; Người dùng thay đổi mục đích; Người dùng không hài lòng với dịch vụ; dịch vụ bị chấm dứt do vi phạm Điều khoản; dịch vụ bị tạm ngưng hoặc chấm dứt theo yêu cầu của cơ quan có thẩm quyền.',
          '31.4. Người dùng hiểu và đồng ý rằng phí dịch vụ đã thanh toán là chi phí cấp phát tài nguyên, vận hành hạ tầng và duy trì hệ thống; việc không hoàn tiền là điều kiện bắt buộc để đảm bảo tính ổn định và công bằng của dịch vụ Cloud.',
        ],
      },
      {
        number: '32',
        heading: 'Tạm ngưng dịch vụ do vi phạm hoặc rủi ro',
        paragraphs: [
          '32.1. OracleCloud Vietnam có quyền tạm ngưng dịch vụ mà không cần báo trước khi phát hiện dấu hiệu vi phạm Điều khoản; phát sinh rủi ro an ninh mạng; hành vi gây ảnh hưởng đến hệ thống chung; yêu cầu từ cơ quan nhà nước có thẩm quyền.',
          '32.2. Thời gian tạm ngưng không được cộng bù vào thời hạn sử dụng và không làm phát sinh nghĩa vụ hoàn tiền hay bồi thường.',
        ],
      },
      {
        number: '33',
        heading: 'Hết hạn dịch vụ và xử lý máy ảo',
        paragraphs: [
          '33.1. Khi dịch vụ hết hạn và không được gia hạn, OracleCloud Vietnam có quyền tạm ngưng máy ảo; thu hồi tài nguyên đã cấp phát; ngừng quyền truy cập của Người dùng.',
          '33.2. Thời gian lưu trữ dữ liệu sau khi hết hạn (nếu có) hoàn toàn phụ thuộc vào chính sách kỹ thuật tại từng thời điểm và không được đảm bảo.',
          '33.3. OracleCloud Vietnam không chịu trách nhiệm đối với mất mát dữ liệu do hết hạn dịch vụ; thiệt hại phát sinh từ việc máy ảo bị ngừng hoạt động.',
        ],
      },
      {
        number: '34',
        heading: 'Thu hồi và xóa dữ liệu',
        paragraphs: [
          '34.1. Sau khi dịch vụ bị chấm dứt hoặc hết hạn, OracleCloud Vietnam có quyền xóa vĩnh viễn máy ảo; xóa toàn bộ dữ liệu liên quan; thu hồi IP và tài nguyên đã cấp phát.',
          '34.2. Việc xóa dữ liệu có thể được thực hiện mà không cần thông báo trước và không làm phát sinh nghĩa vụ khôi phục dữ liệu.',
          '34.3. Người dùng có trách nhiệm sao lưu dữ liệu trước khi hủy hoặc hết hạn dịch vụ; chấp nhận rủi ro mất dữ liệu nếu không thực hiện sao lưu.',
        ],
      },
      {
        number: '35',
        heading: 'Ngừng cung cấp dịch vụ theo quyết định quản lý',
        paragraphs: [
          '35.1. Trong trường hợp thay đổi chính sách pháp luật; thay đổi điều kiện hợp tác với nhà cung cấp hạ tầng; yêu cầu từ cơ quan quản lý nhà nước – OracleCloud Vietnam có quyền ngừng cung cấp một phần hoặc toàn bộ dịch vụ.',
          '35.2. Việc ngừng cung cấp dịch vụ theo điều này không được xem là vi phạm nghĩa vụ và không làm phát sinh nghĩa vụ hoàn tiền hoặc bồi thường.',
        ],
      },
      {
        number: '36',
        heading: 'Miễn trừ trách nhiệm liên quan đến thanh toán',
        paragraphs: [
          '36.1. OracleCloud Vietnam không chịu trách nhiệm đối với lỗi thanh toán do bên trung gian; lỗi hệ thống ngân hàng hoặc cổng thanh toán.',
        ],
      },
    ],
  },
];

function cloneArticles(articles: DefaultTermsArticle[]): DefaultTermsArticle[] {
  return articles.map((article) => ({
    number: article.number,
    heading: article.heading,
    paragraphs: [...article.paragraphs],
  }));
}

export const DEFAULT_TERMS_SECTIONS: DefaultTermsSection[] = VI_TERMS_SECTIONS.map((section) => ({
  titleVi: section.title,
  // Initial EN version is derived from VI content and can be edited independently in Admin Terms.
  titleEn: section.title,
  articlesVi: cloneArticles(section.articles),
  articlesEn: cloneArticles(section.articles),
}));
