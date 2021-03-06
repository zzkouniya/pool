import styled from 'styled-components';

export const Block = styled.section`
  margin-bottom: 16px;
  padding: 16px;
  border-radius: 16px;
  box-shadow: 3px 3px 8px 0 rgba(0, 0, 0, 0.08);
  background-color: #ffffff;
  transition: height 0.8s linear;
  &:first-child {
    margin-top: 16px;
  }
`;
